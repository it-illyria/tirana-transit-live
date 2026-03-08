import { useState, useMemo } from "react";
import { Search, ChevronUp, MapPin, Bus, Star, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGTFS } from "@/contexts/GTFSContext";
import { getFavorites } from "@/lib/favorites";
import { getUpcomingDepartures } from "@/lib/trip-planner";

type Tab = "routes" | "buses" | "favorites";

interface FavoriteStopCardProps {
  stop: {
    stop_id: string;
    stop_name: string;
  };
}

const BottomSheet = () => {
  const { t } = useI18n();
  const { data, buses, setSelectedRouteId, setSelectedBusId } = useGTFS();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("routes");

  const routes = useMemo(() => {
    if (!data) return [];
    return data.routes.filter(
      (r) =>
        r.route_short_name.toLowerCase().includes(search.toLowerCase()) ||
        r.route_long_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  const activeBusesByRoute = useMemo(() => {
    const grouped = new Map<string, typeof buses>();
    for (const bus of buses) {
      const list = grouped.get(bus.route_id) || [];
      list.push(bus);
      grouped.set(bus.route_id, list);
    }
    return grouped;
  }, [buses]);

  const favoriteStops = useMemo(() => {
    if (!data) return [];
    const favIds = getFavorites();
    return data.stops.filter((s) => favIds.includes(s.stop_id));
  }, [data]);

  const tabs: { key: Tab; label: string; icon: typeof Bus }[] = [
    { key: "routes", label: t.allRoutes, icon: Bus },
    { key: "buses", label: t.activeBuses, icon: Clock },
    { key: "favorites", label: t.favorites, icon: Star },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[1000] transition-transform duration-300 ease-out ${
        expanded ? "translate-y-0" : "translate-y-[calc(100%-5.5rem)]"
      }`}
    >
      <div className="glass-surface shadow-[0_-4px_24px_-4px_hsl(220_20%_10%/0.12)] rounded-t-2xl max-w-2xl mx-auto min-h-[70vh]">
        {/* Handle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex flex-col items-center pt-3 pb-2 cursor-pointer"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <div className="w-10 h-1 rounded-full bg-border mb-3" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <ChevronUp className={`w-4 h-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
            <span className="text-sm font-medium">{t.findBus}</span>
          </div>
        </button>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); if (!expanded) setExpanded(true); }}
              onFocus={() => setExpanded(true)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm placeholder:text-muted-foreground outline-none ring-1 ring-transparent focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 pb-3 flex gap-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-accent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 pb-8 max-h-[50vh] overflow-y-auto">
          {tab === "routes" && (
            <div className="space-y-2 animate-in fade-in duration-200">
              {routes.map((route) => (
                <button
                  key={route.route_id}
                  onClick={() => { setSelectedRouteId(route.route_id); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-accent transition-colors text-left shadow-sm"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: route.route_color, color: "white" }}
                  >
                    {route.route_short_name || <Bus className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{route.route_short_name} {route.route_long_name}</p>
                  </div>
                  <span className="text-xs font-medium text-primary">{t.liveTracking}</span>
                </button>
              ))}
              {routes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">{t.noResults}</p>
              )}
            </div>
          )}

          {tab === "buses" && (
            <div className="space-y-3 animate-in fade-in duration-200">
              {Array.from(activeBusesByRoute.entries()).map(([routeId, routeBuses]) => {
                const route = data?.routes.find((r) => r.route_id === routeId);
                return (
                  <div key={routeId}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: route?.route_color || "#0066CC", color: "white" }}
                      >
                        {route?.route_short_name?.slice(0, 3) || "?"}
                      </div>
                      <span className="text-xs font-semibold text-foreground">{route?.route_long_name || routeId}</span>
                    </div>
                    {routeBuses.map((bus) => (
                      <button
                        key={bus.vehicle_id}
                        onClick={() => { setSelectedBusId(bus.vehicle_id); setSelectedRouteId(routeId); }}
                        className="w-full flex items-center gap-3 p-2 pl-8 rounded-lg hover:bg-accent transition-colors text-left"
                      >
                        <span className="text-xs text-muted-foreground">{bus.vehicle_id}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          bus.status === "at_stop" ? "bg-yellow-100 text-yellow-700" : 
                          bus.status === "delayed" ? "bg-red-100 text-red-700" : 
                          "bg-green-100 text-green-700"
                        }`}>
                          {bus.status === "at_stop" ? "At Stop" : bus.status === "delayed" ? "Delayed" : `${Math.round(bus.speed)} km/h`}
                        </span>
                        {bus.next_stop_name && (
                          <span className="text-xs text-muted-foreground truncate">
                            → {bus.next_stop_name} {bus.eta_minutes > 0 && `(${bus.eta_minutes}m)`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
              {buses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">{t.noResults}</p>
              )}
            </div>
          )}

          {tab === "favorites" && (
            <div className="space-y-2 animate-in fade-in duration-200">
              {favoriteStops.length > 0 ? (
                favoriteStops.map((stop) => <FavoriteStopCard key={stop.stop_id} stop={stop} />)
              ) : (
                <div className="text-center py-8">
                  <Star className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{t.noFavorites}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.tapToAdd}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function FavoriteStopCard({ stop }: FavoriteStopCardProps) {
  const { t } = useI18n();
  const { data } = useGTFS();

  const departures = useMemo(() => {
    if (!data) return [];
    return getUpcomingDepartures(data, stop.stop_id, 3);
  }, [data, stop.stop_id]);

  return (
    <div className="p-3 rounded-xl bg-card shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold text-foreground">{stop.stop_name}</span>
      </div>
      {departures.length > 0 ? (
        departures.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs py-0.5">
            <span
              className="px-1.5 py-0.5 rounded font-semibold"
              style={{ backgroundColor: d.routeColor, color: "white", fontSize: 10 }}
            >
              {d.route}
            </span>
            <span className={`font-semibold ${
              d.minutesAway < 5 ? "text-green-600" : d.minutesAway < 15 ? "text-yellow-600" : "text-red-500"
            }`}>
              {d.minutesAway} {t.minutes}
            </span>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">{t.noDepartures}</p>
      )}
    </div>
  );
}

export default BottomSheet;
