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

  const tmcInfo = deriveCid(ecc, pi);
  const cid = tmcInfo?.cid;
  const tabcd = serviceInfo.ltn > 0 ? serviceInfo.ltn : (tmcInfo?.defaultTabcd || 0);

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
      setResolvedLocations(prev => {
        const merged = new Map(prev);
        resolved.forEach((v, k) => merged.set(k, v));
        return merged;
      });
      setResolvedCount(
        [...resolved.values()].filter(l => l.status === 'resolved').length
      );
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

      const marker = L.circleMarker([loc.lat, loc.lon], {
        radius: msg.urgency === 'High Priority' ? 10 : 7,
        fillColor: natureConfig.color,
        color: '#1e293b',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

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
                {tmcInfo.country} (CID:{cid}, TABCD:{tabcd})
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

        {/* Warning: CID not determined */}
        {!cid && (
          <div className="bg-yellow-900/30 border-b border-yellow-500/30 px-4 py-2 text-yellow-400 text-xs">
            Cannot determine TMC country from ECC ({ecc || 'unknown'}) and PI ({pi || 'unknown'}).
            Location resolution requires ECC data from Group 1A.
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
