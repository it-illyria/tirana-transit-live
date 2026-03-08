import { useMemo, useEffect, useState } from "react";
import { Star, MapPin, X, AlertTriangle, Clock, Navigation, Filter } from "lucide-react";
import { useGTFS } from "@/contexts/GTFSContext";
import { getFavorites, toggleFavorite } from "@/lib/favorites";
import { predictArrivals } from "@/lib/arrival-predictions";
import { getUpcomingDepartures } from "@/lib/trip-planner";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FavoritesPanel = ({ open, onClose }: Props) => {
  const { t } = useI18n();
  const { data, buses, setFocusStopId } = useGTFS();
  const [favIds, setFavIds] = useState<string[]>([]);
  const [selectedRouteFilter, setSelectedRouteFilter] = useState<string>("all");

  // Re-read favorites when panel opens or buses update (triggers re-render)
  useEffect(() => {
    if (open) setFavIds(getFavorites());
  }, [open, buses]);

  const favoriteStops = useMemo(() => {
    if (!data) return [];
    return data.stops.filter((s) => favIds.includes(s.stop_id));
  }, [data, favIds]);

  // Get unique routes serving favorite stops
  const availableRoutes = useMemo(() => {
    if (!data || favoriteStops.length === 0) return [];
    const routeIds = new Set<string>();
    favoriteStops.forEach((stop) => {
      const stopTimes = data.stopTimes.filter((st) => st.stop_id === stop.stop_id);
      stopTimes.forEach((st) => {
        const trip = data.trips.find((tr) => tr.trip_id === st.trip_id);
        if (trip) routeIds.add(trip.route_id);
      });
    });
    return data.routes.filter((r) => routeIds.has(r.route_id));
  }, [data, favoriteStops]);

  const handleRemove = (stopId: string) => {
    toggleFavorite(stopId);
    setFavIds(getFavorites());
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-sm h-full bg-card shadow-[-8px_0_32px_-8px_hsl(var(--foreground)/0.15)] flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            <h2 className="text-base font-bold text-foreground">{t.favorites}</h2>
            <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {favoriteStops.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {availableRoutes.length > 0 && (
              <Select value={selectedRouteFilter} onValueChange={setSelectedRouteFilter}>
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Routes</SelectItem>
                  {availableRoutes.map((route) => (
                    <SelectItem key={route.route_id} value={route.route_id}>
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5"
                        style={{ backgroundColor: `#${route.route_color || "888"}` }}
                      />
                      {route.route_short_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {favoriteStops.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Star className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">{t.noFavorites}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.tapToAdd}</p>
            </div>
          ) : (
            favoriteStops.map((stop) => (
              <FavStopCard
                key={stop.stop_id}
                stop={stop}
                onRemove={() => handleRemove(stop.stop_id)}
                onLocate={() => {
                  setFocusStopId(stop.stop_id);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

function FavStopCard({
  stop,
  onRemove,
  onLocate,
}: {
  stop: { stop_id: string; stop_name: string };
  onRemove: () => void;
  onLocate: () => void;
}) {
  const { t } = useI18n();
  const { data, buses } = useGTFS();

  const predictions = useMemo(() => {
    if (!data || !buses.length) return [];
    return predictArrivals(data, buses, stop.stop_id, 4);
  }, [data, buses, stop.stop_id]);

  const departures = useMemo(() => {
    if (!data) return [];
    return getUpcomingDepartures(data, stop.stop_id, 3);
  }, [data, stop.stop_id]);

  return (
    <div className="rounded-xl bg-secondary/50 border border-border p-3">
      {/* Stop header */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          onClick={onLocate}
          className="flex items-center gap-2 min-w-0 hover:opacity-70 transition-opacity"
        >
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{stop.stop_name}</span>
          <Navigation className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
        <button
          onClick={onRemove}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
          aria-label="Remove favorite"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Live arrivals */}
      {predictions.length > 0 ? (
        <div className="mb-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live Arrivals
          </div>
          <div className="space-y-1">
            {predictions.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-2 py-1 px-2 rounded-lg bg-card/60"
              >
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: p.routeColor }}
                >
                  {p.routeName}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {p.predictedMinutes <= 0 ? "Now" : `${p.predictedMinutes}m`}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {p.stopsAway} stop{p.stopsAway !== 1 ? "s" : ""}
                </span>
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-semibold text-white ${
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
                    ? "On Time"
                    : `+${p.delayMinutes}m`}
                </span>
                {p.congestionLevel !== "low" && (
                  <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Clock className="w-3.5 h-3.5" />
          No buses approaching
        </div>
      )}

      {/* Scheduled */}
      {departures.length > 0 && (
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
            📅 {t.scheduled}
          </div>
          {departures.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white"
                style={{ backgroundColor: d.routeColor }}
              >
                {d.route}
              </span>
              <span
                className={`font-semibold ${
                  d.minutesAway < 5
                    ? "text-green-600"
                    : d.minutesAway < 15
                    ? "text-yellow-600"
                    : "text-muted-foreground"
                }`}
              >
                {d.minutesAway} {t.minutes}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FavoritesPanel;
