import { TmcResolvedLocation } from '../types';
import {
  OVERPASS_ENDPOINTS,
  TMC_QUERY_STRATEGIES,
  TMC_SERVICE_CONFIG,
  OverpassElement,
} from '../config/tmcSources';

interface OverpassResponse {
  elements: OverpassElement[];
}

// In-memory cache: key = "cid:tabcd:lcd"
const locationCache = new Map<string, TmcResolvedLocation>();
const pendingResolutions = new Set<string>();

// Known working strategy index per country: key = "cid:tabcd"
const strategyCache = new Map<string, number>();

let lastQueryTime = 0;
let activeEndpoint = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastQueryTime;
  if (elapsed < TMC_SERVICE_CONFIG.rateLimitMs) {
    await new Promise(r => setTimeout(r, TMC_SERVICE_CONFIG.rateLimitMs - elapsed));
  }
}

async function queryOverpass(query: string): Promise<OverpassResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= TMC_SERVICE_CONFIG.maxRetries; attempt++) {
    const endpointIndex = (activeEndpoint + attempt) % OVERPASS_ENDPOINTS.length;
    const endpoint = OVERPASS_ENDPOINTS[endpointIndex];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TMC_SERVICE_CONFIG.queryTimeoutMs);

    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });

      if (response.ok) {
        lastQueryTime = Date.now();
        activeEndpoint = endpointIndex;
        return response.json();
      }

      if (response.status === 429 || response.status === 504) {
        lastError = new Error(`Overpass API ${response.status} from ${endpoint.name}`);
        continue;
      }

      throw new Error(`Overpass API error: ${response.status} from ${endpoint.name}`);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        lastError = new Error(`Overpass API timeout from ${endpoint.name}`);
        continue;
      }
      if (attempt < TMC_SERVICE_CONFIG.maxRetries) {
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

// Try all configured strategies, return results from whichever works first
async function queryBatchAutoDetect(
  lcds: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const key = `${cid}:${tabcd}`;
  const knownIndex = strategyCache.get(key);

  // If we already know which strategy works, use it directly
  if (knownIndex !== undefined) {
    const strategy = TMC_QUERY_STRATEGIES[knownIndex];
    const query = strategy.buildQuery(lcds, cid, tabcd);
    const data = await queryOverpass(query);
    return strategy.parseResponse(data.elements, cid, tabcd);
  }

  // Try each strategy in order
  for (let i = 0; i < TMC_QUERY_STRATEGIES.length; i++) {
    const strategy = TMC_QUERY_STRATEGIES[i];
    try {
      if (i > 0) await rateLimitWait();
      const query = strategy.buildQuery(lcds, cid, tabcd);
      const data = await queryOverpass(query);
      const results = strategy.parseResponse(data.elements, cid, tabcd);
      if (results.size > 0) {
        strategyCache.set(key, i);
        return results;
      }
    } catch (err) {
      console.warn(`Strategy "${strategy.name}" failed, trying next:`, err);
    }
  }

  return new Map();
}

export async function resolveLocations(
  locationCodes: number[],
  cid: number,
  tabcd: number
): Promise<Map<number, TmcResolvedLocation>> {
  const results = new Map<number, TmcResolvedLocation>();
  const unresolvedCodes: number[] = [];

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

  const batches: number[][] = [];
  for (let i = 0; i < unresolvedCodes.length; i += TMC_SERVICE_CONFIG.batchSize) {
    batches.push(unresolvedCodes.slice(i, i + TMC_SERVICE_CONFIG.batchSize));
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
      throw err;
    }
  }

  return results;
}

export function clearLocationCache(): void {
  locationCache.clear();
  pendingResolutions.clear();
  strategyCache.clear();
}

export function getCacheSize(): number {
  return locationCache.size;
}
