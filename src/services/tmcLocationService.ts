import { TmcResolvedLocation } from '../types';

interface OverpassElement {
  type: string;
  id: number;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// In-memory cache: key = "cid:tabcd:lcd"
const locationCache = new Map<string, TmcResolvedLocation>();
const pendingResolutions = new Set<string>();

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 1100;

let lastQueryTime = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastQueryTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const response = await fetch(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  });
  if (!response.ok) {
    throw new Error(`Overpass API error: ${response.status}`);
  }
  lastQueryTime = Date.now();
  return response.json();
}

// Primary query: tmc:point relations (modern OSM tagging)
async function queryRelationBatch(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const lcdPattern = lcds.join('|');
  const table = `${cid}:${tabcd}`;

  const query = `[out:json][timeout:60];
relation["type"="tmc:point"]["table"="${table}"]["lcd"~"^(${lcdPattern})$"];
out center;`;

  const data = await queryOverpass(query);
  const resolved = new Map<number, TmcResolvedLocation>();

  for (const el of data.elements) {
    if (el.tags?.lcd && el.center) {
      const lcd = parseInt(el.tags.lcd, 10);
      if (!isNaN(lcd)) {
        resolved.set(lcd, {
          locationCode: lcd,
          lat: el.center.lat,
          lon: el.center.lon,
          name: el.tags.name || undefined,
          roadRef: el.tags.road_ref || undefined,
          status: 'resolved'
        });
      }
    }
  }

  return resolved;
}

// Fallback query: node-level TMC tags (legacy/German-style tagging)
async function queryNodeFallback(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const tagKey = `TMC:cid_${cid}:tabcd_${tabcd}:LocationCode`;
  const lcdPattern = lcds.join('|');

  const query = `[out:json][timeout:30];
node["${tagKey}"~"^(${lcdPattern})$"];
out;`;

  const data = await queryOverpass(query);
  const resolved = new Map<number, TmcResolvedLocation>();

  for (const el of data.elements) {
    if (el.lat !== undefined && el.lon !== undefined && el.tags) {
      const lcdStr = el.tags[tagKey];
      if (lcdStr) {
        const lcd = parseInt(lcdStr, 10);
        if (!isNaN(lcd)) {
          resolved.set(lcd, {
            locationCode: lcd,
            lat: el.lat,
            lon: el.lon,
            name: el.tags.name || undefined,
            status: 'resolved'
          });
        }
      }
    }
  }

  return resolved;
}

async function queryBatch(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  await rateLimitWait();

  // Try relation-based query first
  const resolved = await queryRelationBatch(lcds, cid, tabcd);

  // Fallback to node tags for any unresolved codes
  const stillUnresolved = lcds.filter(lcd => !resolved.has(lcd));
  if (stillUnresolved.length > 0) {
    await rateLimitWait();
    const fallback = await queryNodeFallback(stillUnresolved, cid, tabcd);
    fallback.forEach((loc, lcd) => resolved.set(lcd, loc));
  }

  return resolved;
}

export async function resolveLocations(
  locationCodes: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const results = new Map<number, TmcResolvedLocation>();
  const unresolvedCodes: number[] = [];

  // Check cache first
  for (const lcd of locationCodes) {
    const cacheKey = `${cid}:${tabcd}:${lcd}`;
    const cached = locationCache.get(cacheKey);
    if (cached) {
      results.set(lcd, cached);
    } else if (!pendingResolutions.has(cacheKey)) {
      unresolvedCodes.push(lcd);
    }
  }

  if (unresolvedCodes.length === 0) return results;

  // Split into batches
  const batches: number[][] = [];
  for (let i = 0; i < unresolvedCodes.length; i += BATCH_SIZE) {
    batches.push(unresolvedCodes.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    // Mark as pending
    batch.forEach(lcd => pendingResolutions.add(`${cid}:${tabcd}:${lcd}`));

    try {
      const resolved = await queryBatch(batch, cid, tabcd);

      // Cache resolved locations
      resolved.forEach((loc, lcd) => {
        const cacheKey = `${cid}:${tabcd}:${lcd}`;
        locationCache.set(cacheKey, loc);
        results.set(lcd, loc);
        pendingResolutions.delete(cacheKey);
      });

      // Mark unresolved as not_found
      batch.forEach(lcd => {
        const cacheKey = `${cid}:${tabcd}:${lcd}`;
        if (!resolved.has(lcd)) {
          const notFound: TmcResolvedLocation = {
            locationCode: lcd,
            lat: 0,
            lon: 0,
            status: 'not_found'
          };
          locationCache.set(cacheKey, notFound);
          pendingResolutions.delete(cacheKey);
        }
      });
    } catch (err) {
      console.error('Overpass query failed:', err);
      batch.forEach(lcd => {
        pendingResolutions.delete(`${cid}:${tabcd}:${lcd}`);
      });
    }
  }

  return results;
}

export function clearLocationCache(): void {
  locationCache.clear();
  pendingResolutions.clear();
}

export function getCacheSize(): number {
  return locationCache.size;
}
