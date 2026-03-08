import { useState } from "react";
import { useGTFS } from "@/contexts/GTFSContext";
import { useI18n } from "@/lib/i18n";
import { Moon, Clock, Bus, ChevronDown, ChevronUp, Sun, Calendar } from "lucide-react";

function useCountdown(targetIso: string | undefined) {
  const [remaining, setRemaining] = useState("");

  useState(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(
        h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` : `${m}m ${String(s).padStart(2, "0")}s`
      );
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  // Proper effect
  import("react").then(({ useEffect: _ }) => {});

  return remaining;
}

const NightServiceBanner = () => {
  const { t } = useI18n();
  const { refreshStatus } = useGTFS();
  const [expanded, setExpanded] = useState(false);
  const [countdown, setCountdown] = useState("");

  // Countdown effect
  useState(() => {
    if (!refreshStatus.resumesAt) return;
    const target = new Date(refreshStatus.resumesAt).getTime();

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(
        h > 0
          ? `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
          : `${m}m ${String(s).padStart(2, "0")}s`
      );
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  });

  if (refreshStatus.serviceStatus !== "night") return null;

  return (
    <div className="absolute top-20 left-3 right-3 z-[1000] max-w-sm mx-auto">
      <div className="rounded-2xl glass-surface shadow-float overflow-hidden border border-border/50">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Moon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{t.nightBannerTitle}</p>
            <p className="text-xs text-muted-foreground truncate">{t.serviceNotActive}</p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Countdown */}
        {countdown && (
          <div className="px-4 pb-3">
            <div className="rounded-xl bg-primary/5 border border-primary/10 px-3 py-2.5 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-xs text-muted-foreground">{t.serviceResumes}</span>
              <span className="text-sm font-bold text-primary tabular-nums ml-auto">{countdown}</span>
            </div>
          </div>
        )}

        {/* Expanded schedule details */}
        {expanded && (
          <div className="px-4 pb-4 space-y-2.5 border-t border-border/30 pt-3">
            <div className="flex items-start gap-2.5">
              <Sun className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t.nightBannerMorning}</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Moon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t.nightBannerEvening}</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t.nightBannerWeekend}</p>
            </div>

            {/* Visual schedule bar */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mb-1">
                <span>00:00</span>
                <span>05:00</span>
                <span>12:00</span>
                <span>23:00</span>
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden flex">
                {/* 0-5: no service */}
                <div className="bg-muted-foreground/10" style={{ width: "20.8%" }} />
                {/* 5-6: ramp up */}
                <div className="bg-primary/30" style={{ width: "4.2%" }} />
                {/* 6-23: full service */}
                <div className="bg-primary/70" style={{ width: "70.8%" }} />
                {/* 23-24: ramp down */}
                <div className="bg-primary/20" style={{ width: "4.2%" }} />
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-primary/70" /> {t.active}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/10" /> {t.serviceNotActive}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NightServiceBanner;
