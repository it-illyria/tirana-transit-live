import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import RefreshStatusIndicator from "@/components/RefreshStatusIndicator";
import WalkToStop from "@/components/WalkToStop";
import L from "leaflet";
import React, { useState, useEffect, useMemo, memo, useCallback } from "react";
import { Locate, Maximize, Minimize, Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGTFS } from "@/contexts/GTFSContext";
import { getUpcomingDepartures } from "@/lib/trip-planner";
import { predictArrivals, CONGESTION_ZONES, getCongestionLevel, getCongestionFactor, getTimeMultiplier, type ArrivalPrediction } from "@/lib/arrival-predictions";
import { isFavorite, toggleFavorite } from "@/lib/favorites";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const TIRANA_CENTER: [number, number] = [41.3275, 19.8187];

// Custom stop icon
const stopIcon = new L.DivIcon({
  className: "stop-marker",
  html: `<div style="width:10px;height:10px;background:#0066CC;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Bus icon factory
function createBusIcon(color: string, heading: number) {
  return new L.DivIcon({
    className: "bus-marker",
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border:2px solid white;
      border-radius:6px;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      transform:rotate(${heading}deg);
      transition:transform 0.5s ease;
      color:white;font-size:14px;font-weight:bold;
    ">🚌</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Track map viewport
function ViewportTracker({ onBoundsChange }: { onBoundsChange: (bounds: L.LatLngBounds) => void }) {
  const onBoundsChangeRef = React.useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  const map = useMapEvents({
    moveend: () => onBoundsChangeRef.current(map.getBounds()),
    zoomend: () => onBoundsChangeRef.current(map.getBounds()),
  });

  useEffect(() => {
    onBoundsChangeRef.current(map.getBounds());
  }, [map]);

  return null;
}

function LocateButton() {
  const map = useMap();
  const { t } = useI18n();

  return (
    <button
      onClick={() => map.locate({ setView: true, maxZoom: 16 })}
      className="absolute bottom-28 right-3 z-[1000] w-10 h-10 rounded-xl glass-surface shadow-float flex items-center justify-center hover:bg-accent transition-colors"
      aria-label={t.myLocation}
    >
      <Locate className="w-5 h-5 text-primary" />
    </button>
  );
}

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);
  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFs(true);
    } else {
      document.exitFullscreen();
      setIsFs(false);
    }
  };

  return (
    <button
      onClick={toggle}
      className="absolute bottom-40 right-3 z-[1000] w-10 h-10 rounded-xl glass-surface shadow-float flex items-center justify-center hover:bg-accent transition-colors"
      aria-label="Fullscreen"
    >
      {isFs ? <Minimize className="w-5 h-5 text-foreground" /> : <Maximize className="w-5 h-5 text-foreground" />}
    </button>
  );
}

// Center map on a specific bus
function CenterOnBus() {
  const map = useMap();
  const { buses, selectedBusId } = useGTFS();

  useEffect(() => {
    if (!selectedBusId) return;
    const bus = buses.find((b) => b.vehicle_id === selectedBusId);
    if (bus) {
      map.flyTo([bus.latitude, bus.longitude], 16, { duration: 0.5 });
    }
  }, [selectedBusId, buses, map]);

  return null;
}

const StopMarker = memo(({ stop, data }: { stop: { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number }; data: any }) => {
  const { t } = useI18n();
  const { buses } = useGTFS();
  const [fav, setFav] = useState(isFavorite(stop.stop_id));

  const predictions = useMemo(() => {
    if (!data || !buses.length) return [];
    return predictArrivals(data, buses, stop.stop_id, 4);
  }, [data, buses, stop.stop_id]);

  const departures = useMemo(() => {
    if (!data) return [];
    return getUpcomingDepartures(data, stop.stop_id, 3);
  }, [data, stop.stop_id]);

  const statusColor = (status: ArrivalPrediction["status"]) => {
    switch (status) {
      case "on_time": return "#22c55e";
      case "slightly_delayed": return "#eab308";
      case "delayed": return "#f97316";
      case "heavily_delayed": return "#ef4444";
    }
  };

  const statusLabel = (status: ArrivalPrediction["status"]) => {
    switch (status) {
      case "on_time": return "On Time";
      case "slightly_delayed": return "Slight Delay";
      case "delayed": return "Delayed";
      case "heavily_delayed": return "Heavy Delay";
    }
  };

  const congestionColor = (level: ArrivalPrediction["congestionLevel"]) => {
    switch (level) {
      case "low": return "#22c55e";
      case "moderate": return "#eab308";
      case "heavy": return "#f97316";
      case "severe": return "#ef4444";
    }
  };

  return (
    <Marker position={[stop.stop_lat, stop.stop_lon]} icon={stopIcon}>
      <Popup>
        <div style={{ minWidth: 220, maxWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>{stop.stop_name}</strong>
            <button
              onClick={() => { toggleFavorite(stop.stop_id); setFav(!fav); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}
              aria-label={fav ? t.removeFavorite : t.addFavorite}
            >
              {fav ? "★" : "☆"}
            </button>
          </div>

          {/* Arrival Predictions */}
          {predictions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                🚌 Predicted Arrivals
              </div>
              {predictions.map((p, i) => (
                <div key={i} style={{ 
                  padding: "4px 0", 
                  borderBottom: i < predictions.length - 1 ? "1px solid #f0f0f0" : "none",
                  fontSize: 12,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      background: p.routeColor,
                      color: "white",
                      padding: "1px 6px",
                      borderRadius: 4,
                      fontWeight: 700,
                      fontSize: 11,
                      minWidth: 28,
                      textAlign: "center",
                    }}>{p.routeName}</span>
                    <span style={{ fontWeight: 700, color: "#333" }}>
                      {p.predictedMinutes} min
                    </span>
                    <span style={{
                      fontSize: 9,
                      padding: "1px 4px",
                      borderRadius: 3,
                      background: statusColor(p.status),
                      color: "white",
                      fontWeight: 600,
                    }}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 10, color: "#888" }}>
                    <span>{p.stopsAway} stops away</span>
                    <span>·</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: congestionColor(p.congestionLevel),
                        display: "inline-block",
                      }} />
                      Traffic: {p.congestionLevel}
                    </span>
                    {p.delayMinutes > 0 && (
                      <>
                        <span>·</span>
                        <span style={{ color: "#ef4444" }}>+{p.delayMinutes}m</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Schedule-based departures */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
            📅 {t.scheduled}
          </div>
          {departures.length > 0 ? (
            departures.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 12 }}>
                <span style={{
                  background: d.routeColor,
                  color: "white",
                  padding: "1px 6px",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 11,
                }}>{d.route}</span>
                <span style={{
                  color: d.minutesAway < 5 ? "#22c55e" : d.minutesAway < 15 ? "#eab308" : "#ef4444",
                  fontWeight: 600,
                }}>{d.minutesAway} {t.minutes}</span>
                <span style={{ color: "#999", fontSize: 10 }}>{d.headsign}</span>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 11, color: "#999" }}>{t.noDepartures}</div>
          )}
        </div>
      </Popup>
    </Marker>
  );
});

StopMarker.displayName = "StopMarker";

const MapView = () => {
  const { data, buses, selectedRouteId } = useGTFS();
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(13);
  const [showCongestion, setShowCongestion] = useState(false);

  // Build all route polylines with traffic coloring
  const trafficRouteSegments = useMemo(() => {
    if (!showCongestion || !data) return [];

    const segments: { positions: [number, number][]; color: string; weight: number }[] = [];
    const seenShapes = new Set<string>();

    // Group shapes
    const shapeGroups = new Map<string, { lat: number; lon: number; seq: number }[]>();
    for (const s of data.shapes) {
      const group = shapeGroups.get(s.shape_id) || [];
      group.push({ lat: s.shape_pt_lat, lon: s.shape_pt_lon, seq: s.shape_pt_sequence });
      shapeGroups.set(s.shape_id, group);
    }

    // For each route, get the shape and color segments by congestion
    for (const trip of data.trips) {
      if (!trip.shape_id || seenShapes.has(trip.shape_id)) continue;
      seenShapes.add(trip.shape_id);

      const shapePoints = shapeGroups.get(trip.shape_id);
      if (!shapePoints || shapePoints.length < 2) continue;

      const sorted = shapePoints.sort((a, b) => a.seq - b.seq);

      // Sample every few points to create colored segments
      for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const midLat = (p1.lat + p2.lat) / 2;
        const midLon = (p1.lon + p2.lon) / 2;

        const factor = getCongestionFactor(midLat, midLon);
        const level = getCongestionLevel(factor);
        const color =
          level === "low" ? "#22c55e" :
          level === "moderate" ? "#eab308" :
          level === "heavy" ? "#ef4444" : "#111111";

        segments.push({
          positions: [[p1.lat, p1.lon], [p2.lat, p2.lon]],
          color,
          weight: level === "low" ? 4 : level === "moderate" ? 5 : 6,
        });
      }
    }

    // Fallback: routes without shapes — connect stops
    const routesWithShapes = new Set(
      data.trips.filter((t) => t.shape_id && shapeGroups.has(t.shape_id)).map((t) => t.route_id)
    );
    const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));
    const seenRoutes = new Set<string>();

    for (const trip of data.trips) {
      if (routesWithShapes.has(trip.route_id) || seenRoutes.has(trip.route_id)) continue;
      seenRoutes.add(trip.route_id);

      const tripStops = data.stopTimes
        .filter((st) => st.trip_id === trip.trip_id)
        .sort((a, b) => a.stop_sequence - b.stop_sequence);

      for (let i = 0; i < tripStops.length - 1; i++) {
        const s1 = stopMap.get(tripStops[i].stop_id);
        const s2 = stopMap.get(tripStops[i + 1].stop_id);
        if (!s1 || !s2) continue;

        const midLat = (s1.stop_lat + s2.stop_lat) / 2;
        const midLon = (s1.stop_lon + s2.stop_lon) / 2;
        const factor = getCongestionFactor(midLat, midLon);
        const level = getCongestionLevel(factor);
        const color =
          level === "low" ? "#22c55e" :
          level === "moderate" ? "#eab308" :
          level === "heavy" ? "#ef4444" : "#111111";

        segments.push({
          positions: [[s1.stop_lat, s1.stop_lon], [s2.stop_lat, s2.stop_lon]],
          color,
          weight: level === "low" ? 4 : level === "moderate" ? 5 : 6,
        });
      }
    }

    return segments;
  }, [showCongestion, data]);

  const handleBoundsChange = useCallback((newBounds: L.LatLngBounds) => {
    setBounds(newBounds);
  }, []);

  // Only show stops in viewport (performance)
  const visibleStops = useMemo(() => {
    if (!data || !bounds) return [];
    return data.stops.filter((s) =>
      bounds.contains([s.stop_lat, s.stop_lon])
    );
  }, [data, bounds]);

  // Only show buses in viewport
  const visibleBuses = useMemo(() => {
    if (!bounds) return buses;
    return buses.filter((b) =>
      bounds.contains([b.latitude, b.longitude])
    );
  }, [buses, bounds]);

  // Route polylines for selected route (both directions)
  const routePolylines = useMemo(() => {
    if (!data || !selectedRouteId) return [];

    // Collect unique shape_ids for this route
    const routeTrips = data.trips.filter((t) => t.route_id === selectedRouteId);
    const seenShapes = new Set<string>();
    const polylines: [number, number][][] = [];

    // Group shapes by id for quick lookup
    const shapeGroups = new Map<string, { lat: number; lon: number; seq: number }[]>();
    for (const s of data.shapes) {
      const group = shapeGroups.get(s.shape_id) || [];
      group.push({ lat: s.shape_pt_lat, lon: s.shape_pt_lon, seq: s.shape_pt_sequence });
      shapeGroups.set(s.shape_id, group);
    }

    for (const trip of routeTrips) {
      if (trip.shape_id && !seenShapes.has(trip.shape_id)) {
        seenShapes.add(trip.shape_id);
        const pts = shapeGroups.get(trip.shape_id);
        if (pts && pts.length > 0) {
          const sorted = [...pts].sort((a, b) => a.seq - b.seq);
          polylines.push(sorted.map((p) => [p.lat, p.lon] as [number, number]));
        }
      }
    }

    // If we got shape-based polylines, return them
    if (polylines.length > 0) return polylines;

    // Fallback: connect stops for each direction
    const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));
    const seenDirs = new Set<string>();

    for (const trip of routeTrips) {
      const dirKey = `${trip.route_id}_${trip.direction_id ?? 0}`;
      if (seenDirs.has(dirKey)) continue;
      seenDirs.add(dirKey);

      const tripStops = data.stopTimes
        .filter((st) => st.trip_id === trip.trip_id)
        .sort((a, b) => a.stop_sequence - b.stop_sequence);

      const pts = tripStops
        .map((st) => {
          const s = stopMap.get(st.stop_id);
          return s ? [s.stop_lat, s.stop_lon] as [number, number] : null;
        })
        .filter(Boolean) as [number, number][];

      if (pts.length > 0) polylines.push(pts);
    }

    return polylines;
  }, [data, selectedRouteId]);

  const routeColor = useMemo(() => {
    if (!data || !selectedRouteId) return "#0066CC";
    return data.routes.find((r) => r.route_id === selectedRouteId)?.route_color || "#0066CC";
  }, [data, selectedRouteId]);

  return (
    <div className="fixed inset-0">
      <MapContainer
        center={TIRANA_CENTER}
        zoom={13}
        zoomControl={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | GTFS: Municipality of Tirana (CC-BY-SA-4.0)'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ViewportTracker onBoundsChange={(b) => {
          handleBoundsChange(b);
        }} />

        <ZoomTracker onZoomChange={setZoom} />

        {/* Stops - only when zoomed in enough */}
        {zoom >= 14 && visibleStops.map((stop) => (
          <StopMarker key={stop.stop_id} stop={stop} data={data} />
        ))}

        {/* Route polyline */}
        {routePolyline && (
          <Polyline
            positions={routePolyline}
            pathOptions={{ color: routeColor, weight: 4, opacity: 0.8 }}
          />
        )}

        {/* Buses */}
        {visibleBuses.map((bus) => (
          <Marker
            key={bus.vehicle_id}
            position={[bus.latitude, bus.longitude]}
            icon={createBusIcon(bus.route_color, bus.heading)}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{
                    background: bus.route_color,
                    color: "white",
                    padding: "1px 6px",
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: 12,
                  }}>{bus.route_name}</span>
                  <span style={{
                    fontSize: 10,
                    padding: "1px 4px",
                    borderRadius: 3,
                    background: bus.status === "at_stop" ? "#f59e0b" : bus.status === "delayed" ? "#ef4444" : "#22c55e",
                    color: "white",
                    fontWeight: 600,
                  }}>{bus.status === "at_stop" ? "At Stop" : bus.status === "delayed" ? "Delayed" : "In Transit"}</span>
                </div>
                <div style={{ fontSize: 11, color: "#666" }}>
                  {bus.vehicle_id} · {Math.round(bus.speed)} km/h
                </div>
                {bus.next_stop_name && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <span style={{ color: "#999" }}>Next: </span>
                    <strong>{bus.next_stop_name}</strong>
                    {bus.eta_minutes > 0 && (
                      <span style={{ color: "#22c55e", fontWeight: 600, marginLeft: 4 }}>
                        ~{bus.eta_minutes} min
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>
                  👥 {bus.passengers} passengers
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Traffic congestion on routes */}
        {trafficRouteSegments.map((seg, i) => (
          <Polyline
            key={`traffic-${i}`}
            positions={seg.positions}
            pathOptions={{
              color: seg.color,
              weight: seg.weight,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ))}

        <CenterOnBus />
        <WalkToStop />
        <LocateButton />
        <FullscreenButton />

        {/* Congestion toggle */}
        <button
          onClick={() => setShowCongestion(!showCongestion)}
          className={`absolute bottom-52 right-3 z-[1000] w-10 h-10 rounded-xl shadow-float flex items-center justify-center transition-colors ${
            showCongestion ? "bg-primary text-primary-foreground" : "glass-surface hover:bg-accent"
          }`}
          aria-label="Toggle traffic"
          title="Toggle traffic congestion"
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Congestion Legend */}
        {showCongestion && (
          <div className="absolute top-3 left-3 z-[1000] glass-surface rounded-xl shadow-float p-3 max-w-[180px]">
            <div className="text-xs font-bold text-foreground mb-2">Traffic Conditions</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#22c55e" }} />
                <span className="text-[11px] text-foreground font-medium">Low traffic</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#eab308" }} />
                <span className="text-[11px] text-foreground font-medium">Moderate congestion</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#ef4444" }} />
                <span className="text-[11px] text-foreground font-medium">Heavy congestion</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: "#111111" }} />
                <span className="text-[11px] text-foreground font-medium">Severe congestion</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border">
              <div className="text-[10px] text-muted-foreground">
                {new Date().getHours() >= 7 && new Date().getHours() <= 9
                  ? "🕐 Morning rush hour"
                  : new Date().getHours() >= 17 && new Date().getHours() <= 19
                  ? "🕐 Evening rush hour"
                  : new Date().getHours() >= 22 || new Date().getHours() <= 5
                  ? "🌙 Low traffic period"
                  : "🕐 Normal traffic"}
              </div>
            </div>
          </div>
        )}
      </MapContainer>
      <RefreshStatusIndicator />
    </div>
  );
};

function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  useEffect(() => { onZoomChange(map.getZoom()); }, [map, onZoomChange]);
  return null;
}

export default MapView;
