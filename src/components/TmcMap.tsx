declare const L: any; // Leaflet loaded via CDN

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TmcMessage, TmcServiceInfo, TmcResolvedLocation } from '../types';
import { ECC_PI_TO_TMC_CID } from '../constants';
import { resolveLocations, getCacheSize } from '../services/tmcLocationService';

interface TmcMapProps {
  messages: TmcMessage[];
  serviceInfo: TmcServiceInfo;
  ecc: string;
  pi: string;
  isOpen: boolean;
  onClose: () => void;
}

const NATURE_COLORS: Record<string, { color: string; icon: string }> = {
  "Traffic Flow":       { color: '#f59e0b', icon: 'fa-car' },
  "Accident/Incident":  { color: '#ef4444', icon: 'fa-car-burst' },
  "Closure":            { color: '#dc2626', icon: 'fa-ban' },
  "Lane Restriction":   { color: '#f97316', icon: 'fa-road' },
  "Roadworks":          { color: '#a855f7', icon: 'fa-person-digging' },
  "Danger/Obstruction": { color: '#ef4444', icon: 'fa-triangle-exclamation' },
  "Road Condition":     { color: '#3b82f6', icon: 'fa-snowflake' },
  "Meteorological":     { color: '#6366f1', icon: 'fa-cloud' },
  "Public Event":       { color: '#10b981', icon: 'fa-calendar' },
  "Service/Delay":      { color: '#64748b', icon: 'fa-clock' },
  "Information":        { color: '#06b6d4', icon: 'fa-circle-info' },
};

function deriveCid(ecc: string, pi: string): { cid: number; defaultTabcd: number; country: string } | null {
  if (!ecc || !pi || pi.length < 1) return null;
  const key = `${ecc.toUpperCase()}_${pi.charAt(0).toUpperCase()}`;
  return ECC_PI_TO_TMC_CID[key] || null;
}

// Build deduplicated country list sorted alphabetically
const COUNTRY_LIST: { cid: number; defaultTabcd: number; country: string }[] = (() => {
  const seen = new Set<number>();
  const list: { cid: number; defaultTabcd: number; country: string }[] = [];
  for (const entry of Object.values(ECC_PI_TO_TMC_CID)) {
    if (!seen.has(entry.cid)) {
      seen.add(entry.cid);
      list.push(entry);
    }
  }
  return list.sort((a, b) => a.country.localeCompare(b.country));
})();

export const TmcMap: React.FC<TmcMapProps> = ({
  messages, serviceInfo, ecc, pi, isOpen, onClose
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const [resolvedLocations, setResolvedLocations] = useState<Map<number, TmcResolvedLocation>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [manualCountry, setManualCountry] = useState<{ cid: number; defaultTabcd: number; country: string } | null>(null);

  const autoInfo = deriveCid(ecc, pi);
  const tmcInfo = autoInfo || manualCountry;
  const cid = tmcInfo?.cid;
  const tabcd = serviceInfo.ltn > 0 ? serviceInfo.ltn : (tmcInfo?.defaultTabcd || 0);
  const needsManualSelect = !autoInfo && !manualCountry;

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current).setView([50.0, 10.0], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Fix grey tiles when map is rendered inside a modal
    setTimeout(() => map.invalidateSize(), 300);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, [isOpen]);

  // Resolve locations when modal is open
  const doResolve = useCallback(async () => {
    if (!isOpen || !cid || !tabcd) return;

    const userMessages = messages.filter(m => !m.isSystem);
    const uniqueCodes = [...new Set(userMessages.map(m => m.locationCode))];
    setTotalCount(uniqueCodes.length);

    if (uniqueCodes.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const resolved = await resolveLocations(uniqueCodes, cid, tabcd);

      // Collect neighbor codes (Prev/Next) for resolved locations to draw lines
      const neighborCodes = new Set<number>();
      resolved.forEach(loc => {
        if (loc.status === 'resolved') {
          if (loc.prevLocationCode) neighborCodes.add(loc.prevLocationCode);
          if (loc.nextLocationCode) neighborCodes.add(loc.nextLocationCode);
        }
      });
      // Remove codes we already have
      resolved.forEach((_, lcd) => neighborCodes.delete(lcd));

      // Resolve neighbor locations
      if (neighborCodes.size > 0) {
        const neighbors = await resolveLocations([...neighborCodes], cid, tabcd);
        neighbors.forEach((v, k) => resolved.set(k, v));
      }

      setResolvedLocations(prev => {
        const merged = new Map(prev);
        resolved.forEach((v, k) => merged.set(k, v));
        return merged;
      });
      const resolvedItems = [...resolved.values()].filter(l => l.status === 'resolved');
      setResolvedCount(resolvedItems.length);

      if (resolvedItems.length === 0 && uniqueCodes.length > 0) {
        setError(`No TMC location data found in OpenStreetMap for this country (CID:${cid}, TABCD:${tabcd}). Not all countries have TMC locations imported into OSM.`);
      }
    } catch (err: any) {
      setError(`Failed to resolve locations: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [isOpen, messages.length, cid, tabcd]);

  useEffect(() => {
    doResolve();
  }, [doResolve]);

  // Update markers when resolved locations change
  useEffect(() => {
    if (!markersLayerRef.current || !mapInstanceRef.current) return;

    markersLayerRef.current.clearLayers();
    const bounds: [number, number][] = [];

    const userMessages = messages.filter(m => !m.isSystem);

    for (const msg of userMessages) {
      const loc = resolvedLocations.get(msg.locationCode);
      if (!loc || loc.status !== 'resolved') continue;

      const natureConfig = NATURE_COLORS[msg.nature] || NATURE_COLORS["Information"];

      // Draw line for Traffic Flow events (files) using Prev/Next location
      const isTrafficFlow = msg.nature === 'Traffic Flow';
      if (isTrafficFlow) {
        const neighborCode = msg.direction ? loc.prevLocationCode : loc.nextLocationCode;
        const neighborLoc = neighborCode ? resolvedLocations.get(neighborCode) : undefined;
        if (neighborLoc && neighborLoc.status === 'resolved') {
          const polyline = L.polyline(
            [[loc.lat, loc.lon], [neighborLoc.lat, neighborLoc.lon]],
            { color: natureConfig.color, weight: 4, opacity: 0.7, dashArray: '8, 6' }
          );
          polyline.addTo(markersLayerRef.current);
          bounds.push([neighborLoc.lat, neighborLoc.lon]);
        }
      }

      const marker = L.circleMarker([loc.lat, loc.lon], {
        radius: msg.urgency === 'High Priority' ? 10 : 7,
        fillColor: natureConfig.color,
        color: '#1e293b',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      // Tooltip on hover (compact)
      const tooltipContent = `<div style="font-family:'Inter',sans-serif;font-size:11px;">
        <b style="color:${natureConfig.color}">${escapeHtml(msg.label)}</b><br/>
        #${msg.locationCode}${loc.name ? ` — ${escapeHtml(loc.name)}` : ''}<br/>
        ${escapeHtml(msg.nature)} · ${escapeHtml(msg.urgency)} · ${escapeHtml(msg.durationLabel)}
      </div>`;
      marker.bindTooltip(tooltipContent, { className: 'tmc-popup', direction: 'top', offset: [0, -8] });

      // Popup on click (full details)
      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; min-width: 200px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 6px; color: ${natureConfig.color};">
            ${escapeHtml(msg.label)}
          </div>
          <div style="font-size: 11px; color: #94a3b8; line-height: 1.6;">
            <b>Location:</b> #${msg.locationCode}${loc.name ? ` — ${escapeHtml(loc.name)}` : ''}${loc.roadRef ? ` (${escapeHtml(loc.roadRef)})` : ''}<br/>
            <b>Direction:</b> ${msg.direction ? 'Negative (−)' : 'Positive (+)'}<br/>
            <b>Nature:</b> ${escapeHtml(msg.nature)}<br/>
            <b>Urgency:</b> ${escapeHtml(msg.urgency)}<br/>
            <b>Duration:</b> ${escapeHtml(msg.durationLabel)}<br/>
            <b>Received:</b> ${escapeHtml(msg.receivedTime)}${msg.diversion ? '<br/><span style="color:#f59e0b;">⚠ Diversion Advised</span>' : ''}
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { className: 'tmc-popup', maxWidth: 300 });
      marker.addTo(markersLayerRef.current);
      bounds.push([loc.lat, loc.lon]);
    }

    if (bounds.length > 0) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [resolvedLocations, messages]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full h-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-white text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <i className="fa-solid fa-map-location-dot text-cyan-400"></i>
              TMC Traffic Map
            </h3>
            {loading && (
              <span className="text-[10px] text-cyan-400 font-mono animate-pulse">
                Resolving locations...
              </span>
            )}
            {tmcInfo && (
              <span className="text-[10px] text-slate-500 font-mono">
                {tmcInfo.country}{!autoInfo ? ' (manual)' : ''} (CID:{cid}, TABCD:{tabcd})
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-mono">
              {resolvedCount}/{totalCount} mapped | Cache: {getCacheSize()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={doResolve}
              disabled={loading || !cid}
              className="px-2 py-1 text-[10px] uppercase font-bold rounded border bg-slate-800 text-cyan-400 border-slate-700 hover:bg-slate-700 disabled:opacity-30 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 text-[10px] uppercase font-bold rounded border bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-900/30 border-b border-red-500/30 px-4 py-2 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Country selector when ECC is not available */}
        {needsManualSelect && (
          <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 shrink-0">
            <div className="text-yellow-400 text-xs mb-2">
              Country not detected (no ECC from Group 1A). Please select the country:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COUNTRY_LIST.map(entry => (
                <button
                  key={entry.cid}
                  onClick={() => setManualCountry(entry)}
                  className="px-2.5 py-1 text-[10px] font-bold rounded border bg-slate-800 text-slate-300 border-slate-700 hover:bg-cyan-900/40 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
                >
                  {entry.country}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 px-4 py-2 bg-slate-950/50 border-b border-slate-800 text-[10px] shrink-0">
          {Object.entries(NATURE_COLORS).map(([nature, config]) => (
            <div key={nature} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full inline-block border border-slate-700"
                style={{ backgroundColor: config.color }}
              />
              <span className="text-slate-400">{nature}</span>
            </div>
          ))}
        </div>

        {/* Map container */}
        <div ref={mapContainerRef} className="flex-1 min-h-0" />
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
