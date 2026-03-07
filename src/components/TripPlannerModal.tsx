import { useState, useMemo } from "react";
import { X, ArrowRight, Search, Bus as BusIcon, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGTFS } from "@/contexts/GTFSContext";
import { findTrips } from "@/lib/trip-planner";
import type { GTFSStop, TripPlan } from "@/lib/gtfs-types";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  open: boolean;
  onClose: () => void;
}

const TripPlannerModal = ({ open, onClose }: Props) => {
  const { t } = useI18n();
  const { data } = useGTFS();
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromStop, setFromStop] = useState<GTFSStop | null>(null);
  const [toStop, setToStop] = useState<GTFSStop | null>(null);
  const [results, setResults] = useState<TripPlan[] | null>(null);
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);

  const fromSuggestions = useMemo(() => {
    if (!data || fromQuery.length < 2) return [];
    return data.stops
      .filter((s) => s.stop_name.toLowerCase().includes(fromQuery.toLowerCase()))
      .slice(0, 8);
  }, [data, fromQuery]);

  const toSuggestions = useMemo(() => {
    if (!data || toQuery.length < 2) return [];
    return data.stops
      .filter((s) => s.stop_name.toLowerCase().includes(toQuery.toLowerCase()))
      .slice(0, 8);
  }, [data, toQuery]);

  const handleSearch = () => {
    if (!data || !fromStop || !toStop) return;
    const plans = findTrips(data, fromStop, toStop);
    setResults(plans);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center"
      >
        <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="relative bg-card rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto shadow-float"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{t.planTrip}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
              aria-label={t.close}
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Inputs */}
          <div className="p-4 space-y-3">
            {/* From */}
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t.from}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={fromQuery}
                  onChange={(e) => { setFromQuery(e.target.value); setFromStop(null); setShowFromSuggestions(true); }}
                  onFocus={() => setShowFromSuggestions(true)}
                  placeholder={t.selectStop}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none ring-1 ring-transparent focus:ring-primary/30"
                />
              </div>
              {showFromSuggestions && fromSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-xl shadow-float border border-border z-10 max-h-48 overflow-y-auto">
                  {fromSuggestions.map((s) => (
                    <button
                      key={s.stop_id}
                      onClick={() => { setFromStop(s); setFromQuery(s.stop_name); setShowFromSuggestions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors text-foreground"
                    >
                      {s.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* To */}
            <div className="relative">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t.to}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={toQuery}
                  onChange={(e) => { setToQuery(e.target.value); setToStop(null); setShowToSuggestions(true); }}
                  onFocus={() => setShowToSuggestions(true)}
                  placeholder={t.selectStop}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary text-foreground text-sm outline-none ring-1 ring-transparent focus:ring-primary/30"
                />
              </div>
              {showToSuggestions && toSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card rounded-xl shadow-float border border-border z-10 max-h-48 overflow-y-auto">
                  {toSuggestions.map((s) => (
                    <button
                      key={s.stop_id}
                      onClick={() => { setToStop(s); setToQuery(s.stop_name); setShowToSuggestions(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors text-foreground"
                    >
                      {s.stop_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={!fromStop || !toStop}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              {t.findRoutes}
            </button>
          </div>

          {/* Results */}
          {results !== null && (
            <div className="p-4 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t.tripResults}</h3>
              {results.length > 0 ? (
                <div className="space-y-3">
                  {results.map((plan, i) => (
                    <div key={i} className="p-3 rounded-xl bg-secondary">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {plan.departureTime.slice(0, 5)} → {plan.arrivalTime.slice(0, 5)}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          {plan.duration} {t.minutes}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {plan.steps.map((step, j) => (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            {step.type === "board" && (
                              <>
                                <BusIcon className="w-3.5 h-3.5 text-primary" />
                                <span
                                  className="px-1.5 py-0.5 rounded font-bold"
                                  style={{ backgroundColor: step.route?.route_color, color: "white", fontSize: 10 }}
                                >
                                  {step.route?.route_short_name}
                                </span>
                                <span className="text-foreground">{t.board} {step.stop.stop_name}</span>
                                <span className="text-muted-foreground ml-auto">{step.time.slice(0, 5)}</span>
                              </>
                            )}
                            {step.type === "alight" && (
                              <>
                                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-foreground">{t.alight} {step.stop.stop_name}</span>
                                <span className="text-muted-foreground ml-auto">{step.time.slice(0, 5)}</span>
                              </>
                            )}
                            {step.type === "transfer" && (
                              <>
                                <Clock className="w-3.5 h-3.5 text-yellow-600" />
                                <span className="text-yellow-600 font-medium">{t.transfer} · {step.stop.stop_name}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      {plan.transfers > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {plan.transfers} {t.transfer.toLowerCase()}(s)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t.noResults}</p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default TripPlannerModal;
