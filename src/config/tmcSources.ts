import { TmcResolvedLocation } from '../types';

// ============================================================================
// TMC Location Sources Configuration
//
// This file defines where and how TMC location codes are resolved to
// coordinates. To add a new source:
//
// 1. Add an endpoint to OVERPASS_ENDPOINTS (for Overpass API mirrors), or
// 2. Add a new query strategy to TMC_QUERY_STRATEGIES (for different
//    OSM tagging schemes or entirely different data sources).
//
// Strategies are tried in order — the first one that returns results wins,
// and that strategy is remembered for subsequent queries to the same country.
// ============================================================================

// -- Overpass API Endpoints (mirrors) ----------------------------------------
// Add more mirrors here if the existing ones are unreliable.
// They are tried in round-robin fashion on retries.

export interface OverpassEndpoint {
  name: string;
  url: string;
}

export const OVERPASS_ENDPOINTS: OverpassEndpoint[] = [
  { name: 'Overpass DE',   url: 'https://overpass-api.de/api/interpreter' },
  { name: 'Kumi Systems',  url: 'https://overpass.kumi.systems/api/interpreter' },
];

// -- Query Strategies --------------------------------------------------------
// Each strategy knows how to build an Overpass query and parse the response.
// They are tried in order until one returns results.

export interface OverpassElement {
  type: string;
  id: number;
  center?: { lat: number; lon: number };
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export interface TmcQueryStrategy {
  name: string;
  buildQuery: (lcds: number[], cid: number, tabcd: number) => string;
  parseResponse: (elements: OverpassElement[], cid: number, tabcd: number) => Map<number, TmcResolvedLocation>;
}

export const TMC_QUERY_STRATEGIES: TmcQueryStrategy[] = [

  // Strategy 1: Node-level TMC tags (used by e.g. Germany)
  // Nodes tagged with TMC:cid_XX:tabcd_YY:LocationCode
  {
    name: 'Node tags',
    buildQuery: (lcds, cid, tabcd) => {
      const tagKey = `TMC:cid_${cid}:tabcd_${tabcd}:LocationCode`;
      const lcdPattern = lcds.join('|');
      return `[out:json][timeout:30];\nnode["${tagKey}"~"^(${lcdPattern})$"];\nout;`;
    },
    parseResponse: (elements, cid, tabcd) => {
      const resolved = new Map<number, TmcResolvedLocation>();
      const tagKey = `TMC:cid_${cid}:tabcd_${tabcd}:LocationCode`;
      const tagPrefix = `TMC:cid_${cid}:tabcd_${tabcd}`;

      for (const el of elements) {
        if (el.lat !== undefined && el.lon !== undefined && el.tags) {
          const lcdStr = el.tags[tagKey];
          if (lcdStr) {
            const lcd = parseInt(lcdStr, 10);
            if (!isNaN(lcd)) {
              const prevStr = el.tags[`${tagPrefix}:PrevLocationCode`];
              const nextStr = el.tags[`${tagPrefix}:NextLocationCode`];
              resolved.set(lcd, {
                locationCode: lcd,
                lat: el.lat,
                lon: el.lon,
                name: el.tags.name || undefined,
                prevLocationCode: prevStr ? parseInt(prevStr, 10) : undefined,
                nextLocationCode: nextStr ? parseInt(nextStr, 10) : undefined,
                status: 'resolved'
              });
            }
          }
        }
      }
      return resolved;
    }
  },

  // Strategy 2: tmc:point relations (used by some other countries)
  // Relations with type=tmc:point, table=CID:TABCD, lcd=code
  {
    name: 'Relations',
    buildQuery: (lcds, cid, tabcd) => {
      const lcdPattern = lcds.join('|');
      const table = `${cid}:${tabcd}`;
      return `[out:json][timeout:30];\nrelation["type"="tmc:point"]["table"="${table}"]["lcd"~"^(${lcdPattern})$"];\nout center;`;
    },
    parseResponse: (elements) => {
      const resolved = new Map<number, TmcResolvedLocation>();
      for (const el of elements) {
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
  },

  // -------------------------------------------------------------------
  // To add a new strategy, copy a block above and modify:
  //   name:          A descriptive label (shown in console logs)
  //   buildQuery:    Return an Overpass QL query string
  //   parseResponse: Extract TmcResolvedLocation entries from elements
  // -------------------------------------------------------------------
];

// -- Service Settings --------------------------------------------------------

export const TMC_SERVICE_CONFIG = {
  batchSize: 50,           // Max location codes per Overpass query
  rateLimitMs: 1100,       // Minimum delay between Overpass requests
  queryTimeoutMs: 20000,   // Abort request after this many ms
  maxRetries: 2,           // Number of retry attempts (with endpoint rotation)
};
