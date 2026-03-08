import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { motion, AnimatePresence } from "motion/react";

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

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[1500] px-4 py-2 rounded-xl bg-destructive text-destructive-foreground text-xs font-medium flex items-center gap-2 shadow-float"
        >
          <WifiOff className="w-3.5 h-3.5" />
          {t.offline}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
