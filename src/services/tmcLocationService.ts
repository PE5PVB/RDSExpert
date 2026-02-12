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

// Cache for availability check: key = "cid:tabcd"
const availabilityCache = new Map<string, 'node' | 'relation' | 'none'>();

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 1100;
const QUERY_TIMEOUT_MS = 15000; // Abort fetch after 15s

let lastQueryTime = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastQueryTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

  try {
    const response = await fetch(OVERPASS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }
    lastQueryTime = Date.now();
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Check if TMC location data exists in OSM for a given CID:TABCD.
// Returns the data format that's available, or 'none'.
export async function checkAvailability(cid: number, tabcd: number): Promise<'node' | 'relation' | 'none'> {
  const key = `${cid}:${tabcd}`;
  const cached = availabilityCache.get(key);
  if (cached !== undefined) return cached;

  await rateLimitWait();

  // Check node-level tags first (most common format, e.g. Germany)
  try {
    const nodeQuery = `[out:json][timeout:10];
node["TMC:cid_${cid}:tabcd_${tabcd}:LocationCode"](if:1==1);
out count;`;
    const nodeData = await queryOverpass(nodeQuery);
    const nodeCount = nodeData.elements?.[0]?.tags?.total;
    if (nodeCount && parseInt(nodeCount, 10) > 0) {
      availabilityCache.set(key, 'node');
      return 'node';
    }
  } catch { /* continue to next check */ }

  await rateLimitWait();

  // Check relation-based format
  try {
    const relQuery = `[out:json][timeout:10];
relation["type"="tmc:point"]["table"="${cid}:${tabcd}"];
out count;`;
    const relData = await queryOverpass(relQuery);
    const relCount = relData.elements?.[0]?.tags?.total;
    if (relCount && parseInt(relCount, 10) > 0) {
      availabilityCache.set(key, 'relation');
      return 'relation';
    }
  } catch { /* no relation data */ }

  availabilityCache.set(key, 'none');
  return 'none';
}

// Query node-level TMC tags (e.g. TMC:cid_58:tabcd_1:LocationCode)
async function queryNodeBatch(
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

// Query tmc:point relations
async function queryRelationBatch(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const lcdPattern = lcds.join('|');
  const table = `${cid}:${tabcd}`;

  const query = `[out:json][timeout:30];
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

async function queryBatch(
  lcds: number[],
  cid: number,
  tabcd: number,
  format: 'node' | 'relation'
): Promise<Map<number, TmcResolvedLocation>> {
  await rateLimitWait();

  if (format === 'node') {
    return queryNodeBatch(lcds, cid, tabcd);
  } else {
    return queryRelationBatch(lcds, cid, tabcd);
  }
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

  // Check which format is available
  const format = await checkAvailability(cid, tabcd);
  if (format === 'none') {
    // No data available — mark all as not_found
    unresolvedCodes.forEach(lcd => {
      const cacheKey = `${cid}:${tabcd}:${lcd}`;
      const notFound: TmcResolvedLocation = { locationCode: lcd, lat: 0, lon: 0, status: 'not_found' };
      locationCache.set(cacheKey, notFound);
    });
    return results;
  }

  // Split into batches
  const batches: number[][] = [];
  for (let i = 0; i < unresolvedCodes.length; i += BATCH_SIZE) {
    batches.push(unresolvedCodes.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    batch.forEach(lcd => pendingResolutions.add(`${cid}:${tabcd}:${lcd}`));

    try {
      const resolved = await queryBatch(batch, cid, tabcd, format);

      resolved.forEach((loc, lcd) => {
        const cacheKey = `${cid}:${tabcd}:${lcd}`;
        locationCache.set(cacheKey, loc);
        results.set(lcd, loc);
        pendingResolutions.delete(cacheKey);
      });

      batch.forEach(lcd => {
        const cacheKey = `${cid}:${tabcd}:${lcd}`;
        if (!resolved.has(lcd)) {
          const notFound: TmcResolvedLocation = { locationCode: lcd, lat: 0, lon: 0, status: 'not_found' };
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
  availabilityCache.clear();
}

export function getCacheSize(): number {
  return locationCache.size;
}
