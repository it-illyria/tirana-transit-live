import { useMemo, useState, useEffect } from "react";
import { X, MapPin, ArrowDown, Clock, Users, AlertTriangle, Timer } from "lucide-react";
import { useGTFS } from "@/contexts/GTFSContext";
import { predictArrivals, getCongestionFactor, type ArrivalPrediction } from "@/lib/arrival-predictions";

/** Live Tirana clock hook — updates every second */
function useTiranaClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  // Format in Europe/Tirane timezone
  const formatted = now.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Tirane",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const dateFormatted = now.toLocaleDateString("en-GB", {
    timeZone: "Europe/Tirane",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return { now, formatted, dateFormatted };
}

/** Countdown hook — re-renders every second */
function useCountdown() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

function CountdownBadge({ minutes }: { minutes: number }) {
  useCountdown(); // force re-render every second
  const [startedAt] = useState(() => Date.now());

  const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
  const totalSec = Math.max(0, minutes * 60 - elapsedSec);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;

  if (totalSec <= 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-xs font-bold animate-pulse">
        🚌 Arriving now
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${
      totalSec <= 60 ? "bg-destructive text-destructive-foreground animate-pulse" :
      totalSec <= 120 ? "bg-yellow-500 text-white" :
      "bg-primary/15 text-primary"
    }`}>
      <Timer className="w-3 h-3" />
      {m}:{s.toString().padStart(2, "0")}
    </span>
  );
}

const RouteDetailView = () => {
  const { data, buses, selectedRouteId, setSelectedRouteId, setSelectedBusId } = useGTFS();
  const { formatted: tiranaTime, dateFormatted: tiranaDate } = useTiranaClock();

  const route = useMemo(() => {
    if (!data || !selectedRouteId) return null;
    return data.routes.find((r) => r.route_id === selectedRouteId) || null;
  }, [data, selectedRouteId]);

  // Get ordered stops for this route
  const routeStops = useMemo(() => {
    if (!data || !selectedRouteId) return [];

    // Find a trip for this route
    const trip = data.trips.find((t) => t.route_id === selectedRouteId);
    if (!trip) return [];

    // Get stop times for this trip, ordered
    const stopTimes = data.stopTimes
      .filter((st) => st.trip_id === trip.trip_id)
      .sort((a, b) => a.stop_sequence - b.stop_sequence);

    const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));

    return stopTimes
      .map((st) => {
        const stop = stopMap.get(st.stop_id);
        if (!stop) return null;
        return {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
          arrival_time: st.arrival_time,
          departure_time: st.departure_time,
          sequence: st.stop_sequence,
        };
      })
      .filter(Boolean) as {
        stop_id: string;
        stop_name: string;
        stop_lat: number;
        stop_lon: number;
        arrival_time: string;
        departure_time: string;
        sequence: number;
      }[];
  }, [data, selectedRouteId]);

  // Get predictions for each stop
  const stopPredictions = useMemo(() => {
    if (!data || !buses.length || !routeStops.length) return new Map<string, ArrivalPrediction[]>();

    const map = new Map<string, ArrivalPrediction[]>();
    for (const stop of routeStops) {
      const preds = predictArrivals(data, buses, stop.stop_id, 3)
        .filter((p) => p.routeId === selectedRouteId);
      if (preds.length > 0) {
        map.set(stop.stop_id, preds);
      }
    }
    return map;
  }, [data, buses, routeStops, selectedRouteId]);

  // Buses on this route
  const routeBuses = useMemo(() => {
    return buses.filter((b) => b.route_id === selectedRouteId);
  }, [buses, selectedRouteId]);

  // Find which stop each bus is nearest to
  const busNearStop = useMemo(() => {
    const map = new Map<string, typeof routeBuses>();
    for (const bus of routeBuses) {
      // Find nearest stop
      let nearestId = "";
      let minDist = Infinity;
      for (const stop of routeStops) {
        const d = Math.abs(stop.stop_lat - bus.latitude) + Math.abs(stop.stop_lon - bus.longitude);
        if (d < minDist) {
          minDist = d;
          nearestId = stop.stop_id;
        }
      }
      if (nearestId) {
        const arr = map.get(nearestId) || [];
        arr.push(bus);
        map.set(nearestId, arr);
      }
    }
    return map;
  }, [routeBuses, routeStops]);

  // Compute inter-stop travel times (congestion-adjusted)
  const interStopMinutes = useMemo(() => {
    if (routeStops.length < 2) return [];
    const BASE_SPEED = 18; // km/h
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;

    return routeStops.slice(0, -1).map((s, i) => {
      const next = routeStops[i + 1];
      // Haversine
      const dLat = toRad(next.stop_lat - s.stop_lat);
      const dLon = toRad(next.stop_lon - s.stop_lon);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(s.stop_lat)) * Math.cos(toRad(next.stop_lat)) * Math.sin(dLon / 2) ** 2;
      const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      // Congestion at midpoint
      const midLat = (s.stop_lat + next.stop_lat) / 2;
      const midLon = (s.stop_lon + next.stop_lon) / 2;
      const congestion = getCongestionFactor(midLat, midLon);
      const effectiveSpeed = BASE_SPEED / congestion;
      const minutes = (distKm / effectiveSpeed) * 60 + 0.5; // +30s dwell
      return Math.max(1, Math.round(minutes));
    });
  }, [routeStops]);

  if (!selectedRouteId || !route) return null;

  const statusColor = (status: ArrivalPrediction["status"]) => {
    switch (status) {
      case "on_time": return "bg-green-500";
      case "slightly_delayed": return "bg-yellow-500";
      case "delayed": return "bg-orange-500";
      case "heavily_delayed": return "bg-red-500";
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

  const formatTime = (t: string) => {
    const parts = t.split(":");
    if (parts.length < 2) return t;
    const h = parseInt(parts[0]) % 24;
    return `${h.toString().padStart(2, "0")}:${parts[1]}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[1100] translate-y-0 transition-transform duration-300">
      <div className="glass-surface shadow-[0_-4px_24px_-4px_hsl(220_20%_10%/0.15)] rounded-t-2xl max-w-2xl mx-auto max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 pb-3 border-b border-border shrink-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: route.route_color, color: "white" }}
          >
            {route.route_short_name}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-foreground">{route.route_short_name} {route.route_long_name}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-primary font-semibold">
                🚌 {routeBuses.length} active
              </span>
              <span className="text-xs text-muted-foreground">
                {routeStops.length} stops
              </span>
              {interStopMinutes.length > 0 && (
                <span className="text-xs font-semibold text-foreground flex items-center gap-0.5">
                  <Timer className="w-3 h-3" />
                  {interStopMinutes.reduce((a, b) => a + b, 0)} min total
                </span>
              )}
            </div>
            {/* Tirana real-time clock */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-primary font-bold">
                🕐 {tiranaTime}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {tiranaDate}
              </span>
            </div>
          </div>
          <button
            onClick={() => setSelectedRouteId(null)}
            className="w-8 h-8 rounded-lg bg-secondary hover:bg-accent flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Stops timeline */}
        <div className="overflow-y-auto flex-1 px-4 py-3">
          <div className="relative">
            {routeStops.map((stop, idx) => {
              const predictions = stopPredictions.get(stop.stop_id) || [];
              const nearbyBuses = busNearStop.get(stop.stop_id) || [];
              const isFirst = idx === 0;
              const isLast = idx === routeStops.length - 1;

              return (
                <div key={`${stop.stop_id}-${idx}`} className="relative flex gap-3 pb-1">
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center shrink-0 w-6">
                    <div
                      className={`w-3 h-3 rounded-full border-2 shrink-0 z-10 ${
                        nearbyBuses.length > 0
                          ? "border-primary bg-primary"
                          : isFirst || isLast
                          ? "border-primary bg-background"
                          : "border-muted-foreground/40 bg-background"
                      }`}
                      style={
                        isFirst || isLast
                          ? { borderColor: route.route_color }
                          : undefined
                      }
                    />
                    {!isLast && (
                      <div className="relative w-0.5 flex-1 min-h-[32px]"
                        style={{ backgroundColor: route.route_color, opacity: 0.3 }}
                      >
                        {interStopMinutes[idx] !== undefined && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-medium text-muted-foreground flex items-center gap-0.5">
                            <Timer className="w-2.5 h-2.5" />
                            {interStopMinutes[idx]} min
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stop content */}
                  <div className={`flex-1 pb-3 ${isLast ? "pb-1" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold text-foreground ${
                          isFirst || isLast ? "font-bold" : ""
                        }`}>
                          {stop.stop_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          {formatTime(stop.arrival_time)}
                          {stop.departure_time !== stop.arrival_time && (
                            <span> → {formatTime(stop.departure_time)}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Buses near this stop */}
                    {nearbyBuses.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {nearbyBuses.map((bus) => (
                          <button
                            key={bus.vehicle_id}
                            onClick={() => setSelectedBusId(bus.vehicle_id)}
                            className="flex items-center gap-2 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors w-full text-left"
                          >
                            <span className="text-xs font-bold text-primary">🚌 {bus.vehicle_id}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold text-white ${
                              bus.status === "at_stop" ? "bg-yellow-500" :
                              bus.status === "delayed" ? "bg-red-500" : "bg-green-500"
                            }`}>
                              {bus.status === "at_stop" ? "At Stop" : `${Math.round(bus.speed)} km/h`}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Users className="w-2.5 h-2.5" /> {bus.passengers}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Predictions with countdown */}
                    {predictions.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {predictions.map((p, pi) => (
                          <div key={pi} className="flex items-center gap-2 text-xs">
                            <CountdownBadge minutes={p.predictedMinutes} />
                            <span className={`text-[9px] px-1.5 py-0.5 rounded text-white font-semibold ${statusColor(p.status)}`}>
                              {statusLabel(p.status)}
                            </span>
                            {p.congestionLevel !== "low" && (
                              <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {p.congestionLevel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteDetailView;
