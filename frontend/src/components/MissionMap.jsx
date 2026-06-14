import React, { useRef, useEffect, useState } from 'react';
import { ShieldAlert, Crosshair, HelpCircle, X, Navigation } from 'lucide-react';

const getBaseCoords = (env) => {
  switch (env) {
    case 'open_desert':
      return [35.0110, -115.4734]; // Mojave Desert, CA
    case 'forest_wilderness':
      return [37.8651, -119.5383]; // Yosemite, CA
    case 'flood_zone':
      return [29.9511, -90.0715]; // New Orleans, LA
    case 'maritime_coastal':
      return [36.6002, -121.8947]; // Monterey Coast, CA
    case 'urban_rubble':
    default:
      return [37.7749, -122.4194]; // San Francisco, CA
  }
};

export default function MissionMap({ 
  agents, 
  zones, 
  targets, 
  areaWidth = 10, 
  areaHeight = 10,
  environment
}) {
  const [baseLat, baseLng] = getBaseCoords(environment);

  const gridToLatLng = React.useCallback((x, y) => {
    const latOffset = y / 111.12;
    const lngOffset = x / (111.12 * Math.cos((baseLat * Math.PI) / 180));
    return [baseLat + latOffset, baseLng + lngOffset];
  }, [baseLat, baseLng]);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({
    zones: {},
    agents: {},
    targets: {},
    base: null,
  });
  const historiesRef = useRef({});
  const trailLayersRef = useRef({});
  const crashMarkersLayersRef = useRef({});
  const lastKnownPositionsRef = useRef({});
  // Fog-of-war coverage: set of "cellKey" strings already painted
  const visitedCellsRef = useRef(new Set());
  // Leaflet LayerGroup holding all coverage circle stamps
  const coverageLayerGroupRef = useRef(null);

  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const L = window.L;
    if (!L) {
      console.error('Leaflet library not found on window object.');
      return;
    }

    // Centered around the base station
    const centerLatLng = gridToLatLng(areaWidth / 2, areaHeight / 2);
    const map = L.map(mapContainerRef.current, {
      center: centerLatLng,
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    // Standard OpenStreetMap tiles with dark mode filter
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Render Base Station
    const baseLatLng = gridToLatLng(0, 0);
    const baseIcon = L.divIcon({
      html: `<div style="
        width: 14px;
        height: 14px;
        background-color: #ffffff;
        border: 2px solid #00d4ff;
        border-radius: 50%;
        box-shadow: 0 0 10px #00d4ff;
      "></div>`,
      className: 'base-station-icon',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const baseMarker = L.marker(baseLatLng, { icon: baseIcon })
      .addTo(map)
      .bindTooltip('BASE HQ', { permanent: true, direction: 'right', className: 'map-tooltip' });

    layersRef.current.base = baseMarker;
    const coverageGroup = L.layerGroup().addTo(map);
    coverageLayerGroupRef.current = coverageGroup;

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      coverageLayerGroupRef.current = null;
      visitedCellsRef.current.clear();
      crashMarkersLayersRef.current = {};
      lastKnownPositionsRef.current = {};
    };
  }, [areaWidth, areaHeight, gridToLatLng]);

  // Sync / Render Zones
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    zones.forEach((zone) => {
      if (!zone.polygon || zone.polygon.length === 0) return;
      const latLngs = zone.polygon.map(([x, y]) => gridToLatLng(x, y));
      const zoneId = zone.zone_id || zone.id;

      const cov = zone.coverage_pct || 0;

      // Coverage fills in from 0.03 (base outline visible always) → 0.30 (fully searched)
      const fillAlpha = 0.03 + (cov / 100) * 0.27;
      // Border fades in from dim → bright yellow as coverage grows
      const borderAlpha = 0.15 + (cov / 100) * 0.45;

      if (layersRef.current.zones[zoneId]) {
        // Update styling of existing polygon
        layersRef.current.zones[zoneId].setStyle({
          color: '#FFD700',
          weight: 1,
          opacity: borderAlpha,
          fillColor: '#FFD700',
          fillOpacity: fillAlpha,
        });
      } else {
        // Create new polygon
        const polygonLayer = L.polygon(latLngs, {
          color: '#FFD700',
          weight: 1,
          opacity: borderAlpha,
          fillColor: '#FFD700',
          fillOpacity: fillAlpha,
        }).addTo(map);

        layersRef.current.zones[zoneId] = polygonLayer;
      }
    });
  }, [zones, gridToLatLng]);

  // Sync / Render Targets
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    // Remove targets that no longer exist
    Object.keys(layersRef.current.targets).forEach((id) => {
      if (!targets.some((t) => String(t.id) === id)) {
        layersRef.current.targets[id].remove();
        delete layersRef.current.targets[id];
      }
    });

    targets.forEach((t) => {
      const targetId = String(t.id);
      const latLng = gridToLatLng(t.pos_x, t.pos_y);

      let color = '#ffaa00';
      if (t.target_type === 'survivor') color = '#00ff88';
      if (t.target_type === 'hazard') color = '#ff3b3b';

      const pulseClass = t.target_type === 'survivor' ? 'pulse-survivor' : 'pulse-hazard';

      const iconHtml = `
        <div class="target-marker-wrapper" style="position: relative;">
          <div class="${pulseClass}" style="
            position: absolute;
            left: -11px;
            top: -11px;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: 2px solid ${color};
            opacity: 0.8;
            pointer-events: none;
          "></div>
          <div style="
            width: 16px;
            height: 16px;
            background-color: ${color};
            border-radius: 50%;
            border: 2px solid #ffffff;
          "></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'target-custom-icon',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      if (layersRef.current.targets[targetId]) {
        layersRef.current.targets[targetId].setLatLng(latLng);
      } else {
        const marker = L.marker(latLng, { icon: customIcon })
          .addTo(map)
          .on('click', () => {
            setSelectedTarget(t);
            setSelectedAgent(null);
          });
        layersRef.current.targets[targetId] = marker;
      }
    });
  }, [targets, gridToLatLng]);

  // Sync / Render Agents
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;

    // Remove deleted agents (no longer in telemetry)
    Object.keys(layersRef.current.agents).forEach((id) => {
      if (!agents.some((a) => a.id === id)) {
        layersRef.current.agents[id].remove();
        delete layersRef.current.agents[id];
      }
    });

    // Remove old trails for deleted agents
    Object.keys(trailLayersRef.current).forEach((id) => {
      if (!agents.some((a) => a.id === id)) {
        trailLayersRef.current[id].remove();
        delete trailLayersRef.current[id];
        delete historiesRef.current[id];
      }
    });

    agents.forEach((ag) => {
      const latLng = gridToLatLng(ag.pos_x, ag.pos_y);

      if (ag.status === 'offline') {
        // If agent is offline:
        // 1. Remove normal marker
        if (layersRef.current.agents[ag.id]) {
          layersRef.current.agents[ag.id].remove();
          delete layersRef.current.agents[ag.id];
        }

        // 2. Draw crash marker if not already present
        if (!crashMarkersLayersRef.current[ag.id]) {
          const crashLatLng = lastKnownPositionsRef.current[ag.id] || latLng;
          const crashMarker = L.circleMarker(crashLatLng, {
            radius: 8,
            fillColor: '#ff3b3b',
            fillOpacity: 0.9,
            color: '#ffffff',
            weight: 2
          }).addTo(map);

          crashMarker.bindPopup(`
            <div style="background:#0f1a2e;color:#ff3b3b;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:12px;">
              ✕ AGENT OFFLINE<br/>
              <span style="color:#94a3b8">${ag.id}</span>
            </div>
          `);

          crashMarkersLayersRef.current[ag.id] = crashMarker;
        }

        // Clear trail history for offline agent
        if (historiesRef.current[ag.id]) {
          historiesRef.current[ag.id].length = 0;
        }
        if (trailLayersRef.current[ag.id]) {
          trailLayersRef.current[ag.id].remove();
          delete trailLayersRef.current[ag.id];
        }
        return;
      }

      // If agent is active/returning/charging/resuming:
      // 1. Remove any crash marker
      if (crashMarkersLayersRef.current[ag.id]) {
        crashMarkersLayersRef.current[ag.id].remove();
        delete crashMarkersLayersRef.current[ag.id];
      }

      // 2. Record last known position
      lastKnownPositionsRef.current[ag.id] = latLng;

      // 3. Render normal marker
      let color = '#00ff88'; // active
      if (ag.status === 'returning') color = '#ffaa00';
      else if (ag.status === 'charging') color = '#00d4ff';

      // Heading indicator rotation
      const rotationDegrees = (ag.heading || 0) * (180 / Math.PI);

      const agentIconHtml = `
        <div style="
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          transform: rotate(${rotationDegrees}deg);
        ">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="${color}" stroke="#050a12" stroke-width="1.5">
            <polygon points="12,2 22,22 12,17 2,22" />
          </svg>
        </div>
      `;

      const customIcon = L.divIcon({
        html: agentIconHtml,
        className: 'agent-custom-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (layersRef.current.agents[ag.id]) {
        layersRef.current.agents[ag.id].setLatLng(latLng);
        layersRef.current.agents[ag.id].setIcon(customIcon);
      } else {
        const marker = L.marker(latLng, { icon: customIcon })
          .addTo(map)
          .on('click', () => {
            setSelectedAgent(ag);
            setSelectedTarget(null);
          });
        layersRef.current.agents[ag.id] = marker;
      }

      // Update trail history
      if (!historiesRef.current[ag.id]) {
        historiesRef.current[ag.id] = [];
      }
      const history = historiesRef.current[ag.id];
      const lastPoint = history[history.length - 1];

      // Don't draw path history when agent is sitting at base station
      const isAtBase = Math.abs(ag.pos_x) < 0.001 && Math.abs(ag.pos_y) < 0.001;

      // Stamp coverage circle if agent is exploring (not at base)
      if (!isAtBase) {
        const cellX = Math.round(ag.pos_x * 10) / 10;
        const cellY = Math.round(ag.pos_y * 10) / 10;
        const cellKey = `${cellX},${cellY}`;
        if (!visitedCellsRef.current.has(cellKey)) {
          visitedCellsRef.current.add(cellKey);
          const cellLatLng = gridToLatLng(cellX, cellY);
          if (coverageLayerGroupRef.current) {
            L.circle(cellLatLng, {
              radius: 150, // 150m coverage radius
              color: '#FFD700',
              weight: 0,
              fillColor: '#FFD700',
              fillOpacity: 0.12, // transparent yellowish
              interactive: false,
            }).addTo(coverageLayerGroupRef.current);
          }
        }
      }

      if (isAtBase) {
        history.length = 0;
      } else {
        // Only push if coordinates have moved
        if (!lastPoint || Math.abs(lastPoint[0] - latLng[0]) > 0.00001 || Math.abs(lastPoint[1] - latLng[1]) > 0.00001) {
          // If distance from last point is too high (initialization warp), reset trail
          if (lastPoint && (Math.abs(lastPoint[0] - latLng[0]) > 0.01 || Math.abs(lastPoint[1] - latLng[1]) > 0.01)) {
            history.length = 0;
          }
          history.push(latLng);
          if (history.length > 20) {
            history.shift();
          }
        }
      }

      // Draw trail polyline
      if (history.length >= 2) {
        if (trailLayersRef.current[ag.id]) {
          trailLayersRef.current[ag.id].setLatLngs(history);
          trailLayersRef.current[ag.id].setStyle({ color });
        } else {
          const polyline = L.polyline(history, {
            color: color,
            weight: 2,
            opacity: 0.4,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '3, 5'
          }).addTo(map);
          trailLayersRef.current[ag.id] = polyline;
        }
      } else {
        if (trailLayersRef.current[ag.id]) {
          trailLayersRef.current[ag.id].remove();
          delete trailLayersRef.current[ag.id];
        }
      }
    });
  }, [agents, gridToLatLng]);

  return (
    <div className="flex-1 flex flex-col justify-center items-center bg-[#050a12] relative min-h-[450px] border-r border-slate-900 select-none">
      
      {/* Dynamic Key Info overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex space-x-4 bg-slate-900/95 px-3 py-1.5 rounded-md text-[10px] border border-slate-800 text-slate-400 font-mono shadow-lg">
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 bg-[#00ff88] rounded-sm"></span>
          <span>Active</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 bg-[#ffaa00] rounded-sm"></span>
          <span>Returning</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 bg-[#00d4ff] rounded-sm"></span>
          <span>Charging</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 bg-[#4a5568] rounded-sm"></span>
          <span>Offline</span>
        </div>
      </div>

      {/* Actual Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[450px] rounded shadow-inner" style={{ zIndex: 1 }} />

      {/* Styled Inline CSS injected for leaflet popup/pulse animations */}
      <style>{`
        /* Invert tiles to create dark mode */
        .leaflet-tile {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        
        /* Style map zoom/control buttons */
        .leaflet-bar a {
          background-color: #161b22 !important;
          color: #e6edf3 !important;
          border: 1px solid #30363d !important;
        }
        .leaflet-bar a:hover {
          background-color: #21262d !important;
        }
        
        /* Style popup/tooltip boxes */
        .leaflet-popup-content-wrapper, .leaflet-popup-tip, .map-tooltip {
          background-color: #0f172a !important;
          border: 1px solid #334155 !important;
          color: #f1f5f9 !important;
          font-family: 'Space Grotesk', sans-serif !important;
          font-size: 9px !important;
          padding: 2px 6px !important;
          font-weight: bold;
        }
        .pulse-survivor {
          animation: mapPulse 1.8s infinite ease-out;
        }
        .pulse-hazard {
          animation: mapPulseRed 1.8s infinite ease-out;
        }
        @keyframes mapPulse {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
        @keyframes mapPulseRed {
          0% {
            transform: scale(0.5);
            opacity: 1;
            border-color: #ff3b3b;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
            border-color: #ff3b3b;
          }
        }
      `}</style>

      {/* Agent Popover Info */}
      {selectedAgent && (
        <div className="absolute bottom-4 left-4 w-72 bg-[#0f1a2e]/95 border border-[#00d4ff]/40 p-4 rounded-md shadow-2xl text-white z-[1000] font-mono text-xs">
          <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-1.5">
            <span className="text-[#00d4ff] font-bold">{selectedAgent.id} Telemetry</span>
            <button onClick={() => setSelectedAgent(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className={`font-semibold uppercase ${
                selectedAgent.status === 'active' ? 'text-emerald-400' :
                selectedAgent.status === 'returning' ? 'text-amber-400' :
                selectedAgent.status === 'charging' ? 'text-cyan-400' : 'text-rose-500'
              }`}>{selectedAgent.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Battery:</span>
              <span className="font-semibold text-white">{selectedAgent.battery.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Position:</span>
              <span className="text-slate-300">X: {selectedAgent.pos_x.toFixed(2)}, Y: {selectedAgent.pos_y.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Sector Assignment:</span>
              <span className="text-slate-300">Zone {selectedAgent.zone_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Waypoints Searched:</span>
              <span className="text-slate-300">{selectedAgent.tasks_completed}</span>
            </div>
            {selectedAgent.failure_reason && (
              <div className="mt-2 text-rose-500 bg-rose-950/20 border border-rose-900/40 p-1.5 rounded">
                Fault code: {selectedAgent.failure_reason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Target Popover Info */}
      {selectedTarget && (
        <div className="absolute bottom-4 left-4 w-72 bg-[#0f1a2e]/95 border border-yellow-500/40 p-4 rounded-md shadow-2xl text-white z-[1000] font-mono text-xs">
          <div className="flex justify-between items-center mb-2 border-b border-slate-800 pb-1.5">
            <span className="text-yellow-400 font-bold uppercase">Detected Event Details</span>
            <button onClick={() => setSelectedTarget(null)} className="text-slate-400 hover:text-white"><X size={14} /></button>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Type:</span>
              <span className="font-semibold text-white uppercase">{selectedTarget.target_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Confidence:</span>
              <span className="font-semibold text-emerald-400">{(selectedTarget.confidence * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Coordinates:</span>
              <span className="text-slate-300">X: {selectedTarget.pos_x.toFixed(2)}, Y: {selectedTarget.pos_y.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reporter:</span>
              <span className="text-[#00d4ff]">{selectedTarget.agent_id}</span>
            </div>
            <div className="mt-2 text-slate-300 bg-slate-800/40 p-2 rounded border border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase">AI Description:</div>
              {selectedTarget.description}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
