import { useState, useEffect, useMemo } from "react";
import { MapPin, Navigation, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGTFS } from "@/contexts/GTFSContext";
import { predictArrivals } from "@/lib/arrival-predictions";

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NearestStopWidget = () => {
  const { t } = useI18n();
  const { data, buses, setFocusStopId } = useGTFS();
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const nearest = useMemo(() => {
    if (!userPos || !data) return null;
    let best: { stop: (typeof data.stops)[0]; dist: number } | null = null;
    for (const stop of data.stops) {
      const d = haversine(userPos[0], userPos[1], stop.stop_lat, stop.stop_lon);
      if (!best || d < best.dist) best = { stop, dist: d };
    }
    return best && best.dist < 5 ? best : null; // max 5km
  }, [userPos, data]);

  const predictions = useMemo(() => {
    if (!nearest || !data || !buses.length) return [];
    return predictArrivals(data, buses, nearest.stop.stop_id, 3);
  }, [nearest, data, buses]);

  if (!userPos || !nearest) return null;

  const distMeters = Math.round(nearest.dist * 1000);

  return (
    <div className="fixed bottom-24 left-3 z-[999] max-w-[260px] animate-in slide-in-from-left duration-300">
      <button
        onClick={() => setFocusStopId(nearest.stop.stop_id)}
        className="w-full glass-surface shadow-float rounded-xl p-3 text-left hover:bg-accent/50 transition-colors group"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {t.nearestStop}
            </div>
            <div className="text-xs font-semibold text-foreground truncate">
              {nearest.stop.stop_name}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Navigation className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-bold text-primary">{distMeters}{t.metersAway}</span>
          </div>
        </div>

        {/* Live arrivals */}
        {predictions.length > 0 ? (
          <div className="space-y-1 mt-1">
            {predictions.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: p.routeColor }}
                >
                  {p.routeName}
                </span>
                <span className="text-xs font-bold text-foreground">
                  {p.predictedMinutes} {t.minutes}
                </span>
                <span
                  className={`text-[9px] px-1 py-0.5 rounded font-semibold text-white ${
                    p.status === "on_time"
                      ? "bg-green-500"
                      : p.status === "slightly_delayed"
                      ? "bg-yellow-500"
                      : p.status === "delayed"
                      ? "bg-orange-500"
                      : "bg-red-500"
                  }`}
                >
                  {p.status === "on_time"
                    ? t.onTime
                    : p.status === "slightly_delayed"
                    ? t.slightDelay
                    : p.status === "delayed"
                    ? t.delayed
                    : t.heavyDelay}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground mt-1">{t.noBusesApproaching}</div>
        )}

        <div className="flex items-center justify-end mt-1.5 text-[10px] text-primary font-medium group-hover:underline">
          <ChevronRight className="w-3 h-3" />
        </div>
      </button>
    </div>
  );
};

export default NearestStopWidget;
