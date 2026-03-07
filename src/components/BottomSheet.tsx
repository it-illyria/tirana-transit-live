import { useState, useRef } from "react";
import { Search, ChevronUp, MapPin, Bus } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const MOCK_ROUTES = [
  { id: "L1", name: "Linja 1", from: "Kinostudio", to: "Kombinat", color: "#E53935" },
  { id: "L2", name: "Linja 2", from: "Porcelan", to: "Sauk", color: "#1E88E5" },
  { id: "L3", name: "Linja 3", from: "Yzberisht", to: "Qendër", color: "#43A047" },
  { id: "L4", name: "Linja 4", from: "Tirana e Re", to: "Laprakë", color: "#FB8C00" },
];

const BottomSheet = () => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  const filtered = MOCK_ROUTES.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.from.toLowerCase().includes(search.toLowerCase()) ||
      r.to.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={sheetRef}
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
            <ChevronUp
              className={`w-4 h-4 transition-transform duration-300 ${
                expanded ? "rotate-180" : ""
              }`}
            />
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
              onChange={(e) => {
                setSearch(e.target.value);
                if (!expanded) setExpanded(true);
              }}
              onFocus={() => setExpanded(true)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm placeholder:text-muted-foreground outline-none ring-1 ring-transparent focus:ring-primary/30 transition-all"
            />
          </div>
        </div>

        {/* Routes list */}
        <div className="px-4 pb-8 space-y-2 max-h-[50vh] overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t.allRoutes}
          </p>
          {filtered.map((route) => (
            <button
              key={route.id}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-card hover:bg-accent transition-colors text-left shadow-sm"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: route.color }}
              >
                <Bus className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{route.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  <MapPin className="inline w-3 h-3 mr-0.5" />
                  {route.from} → {route.to}
                </p>
              </div>
              <span className="text-xs font-medium text-primary">{t.liveTracking}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">{t.noResults}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BottomSheet;
