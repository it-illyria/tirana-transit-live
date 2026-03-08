import { useState, useEffect } from "react";
import { useGTFS } from "@/contexts/GTFSContext";
import { useI18n } from "@/lib/i18n";
import { Wifi, WifiOff, Database } from "lucide-react";

const RefreshStatusIndicator = () => {
  const { t } = useI18n();
  const { refreshStatus } = useGTFS();
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);

  useEffect(() => {
    if (!refreshStatus.lastRefresh) return;

    const update = () => {
      setSecondsAgo(Math.floor((Date.now() - refreshStatus.lastRefresh!) / 1000));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [refreshStatus.lastRefresh]);

  if (!refreshStatus.lastRefresh) return null;

  const isStale = secondsAgo !== null && secondsAgo > 15;

  return (
    <div className="absolute bottom-4 left-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass-surface shadow-float text-[11px] font-medium select-none">
      {isStale ? (
        <WifiOff className="w-3.5 h-3.5 text-destructive" />
      ) : (
        <Wifi className="w-3.5 h-3.5 text-primary animate-pulse" />
      )}

      <span className="text-muted-foreground">
        {secondsAgo !== null ? `${secondsAgo}${t.secondsAgo}` : "—"}
      </span>

      <span className="text-muted-foreground/40">·</span>

      <span className={`flex items-center gap-1 ${refreshStatus.cached ? "text-primary" : "text-accent-foreground"}`}>
        <Database className="w-3 h-3" />
        {refreshStatus.cached ? "Redis HIT" : "Redis MISS"}
      </span>

      <span className="text-muted-foreground/40">·</span>

      <span className="text-foreground font-semibold">
        🚌 {refreshStatus.busCount}
      </span>
    </div>
  );
};

export default RefreshStatusIndicator;
