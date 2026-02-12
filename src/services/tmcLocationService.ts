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

// Known working format per country: key = "cid:tabcd"
const formatCache = new Map<string, 'node' | 'relation'>();

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 1100;
const QUERY_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;

let lastQueryTime = 0;
let activeEndpoint = 0; // Index into OVERPASS_ENDPOINTS

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastQueryTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // On retry, try the next endpoint
    const endpointIndex = (activeEndpoint + attempt) % OVERPASS_ENDPOINTS.length;
    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // Backoff
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });

      if (response.ok) {
        lastQueryTime = Date.now();
        activeEndpoint = endpointIndex; // Remember working endpoint
        return response.json();
      }

      // 429 (rate limited) or 504 (timeout) — worth retrying
      if (response.status === 429 || response.status === 504) {
        lastError = new Error(`Overpass API ${response.status} from ${endpoint}`);
        continue;
      }

      throw new Error(`Overpass API error: ${response.status}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error(`Overpass API timeout from ${endpoint}`);
        continue;
      }
      if (attempt < MAX_RETRIES) {
        lastError = err;
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error('Overpass API failed after retries');
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

// Try both query formats, return results from whichever works
async function queryBatchAutoDetect(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const key = `${cid}:${tabcd}`;
  const knownFormat = formatCache.get(key);

  // If we know the format, use it directly
  if (knownFormat === 'node') {
    return queryNodeBatch(lcds, cid, tabcd);
  }
  if (knownFormat === 'relation') {
    return queryRelationBatch(lcds, cid, tabcd);
  }

  // Try node format first (most common, e.g. Germany)
  try {
    const nodeResults = await queryNodeBatch(lcds, cid, tabcd);
    if (nodeResults.size > 0) {
      formatCache.set(key, 'node');
      return nodeResults;
    }
  } catch (err) {
    console.warn('Node query failed, trying relation format:', err);
  }

  await rateLimitWait();

  // Try relation format
  try {
    const relResults = await queryRelationBatch(lcds, cid, tabcd);
    if (relResults.size > 0) {
      formatCache.set(key, 'relation');
      return relResults;
    }
  } catch (err) {
    console.warn('Relation query also failed:', err);
  }

  // Both returned empty or failed
  return new Map();
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
    batch.forEach(lcd => pendingResolutions.add(`${cid}:${tabcd}:${lcd}`));

    try {
      await rateLimitWait();
      const resolved = await queryBatchAutoDetect(batch, cid, tabcd);

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
      console.error('Overpass query failed after retries:', err);
      batch.forEach(lcd => {
        pendingResolutions.delete(`${cid}:${tabcd}:${lcd}`);
      });
      // Re-throw so the UI can show the error
      throw err;
    }
  }

  return results;
}

export function clearLocationCache(): void {
  locationCache.clear();
  pendingResolutions.clear();
  formatCache.clear();
}

export function getCacheSize(): number {
  return locationCache.size;
}
