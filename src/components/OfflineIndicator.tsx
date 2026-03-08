import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const OfflineIndicator = () => {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1500] px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-medium flex items-center gap-2 shadow-float animate-in slide-in-from-top duration-300">
      <WifiOff className="w-3.5 h-3.5" />
      {t.offline}
    </div>
  );
};

export default OfflineIndicator;