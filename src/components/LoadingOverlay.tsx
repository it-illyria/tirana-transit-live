import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useGTFS } from "@/contexts/GTFSContext";
import { Bus, Loader2, AlertCircle } from "lucide-react";

const LoadingOverlay = () => {
  const { t } = useI18n();
  const { loading, error, progress, retry } = useGTFS();

  if (!loading && !error) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[3000] flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card rounded-2xl shadow-float p-8 max-w-xs w-full text-center">
        {loading ? (
          <>
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-2">{t.loading}</h2>
            <p className="text-xs text-muted-foreground">{progress}</p>
            {/* Skeleton bars */}
            <div className="mt-4 space-y-2">
              <div className="h-3 bg-muted rounded-full animate-pulse" />
              <div className="h-3 bg-muted rounded-full animate-pulse w-3/4" />
              <div className="h-3 bg-muted rounded-full animate-pulse w-1/2" />
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-2">{t.loadingError}</h2>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <button
              onClick={retry}
              className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t.retry}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default LoadingOverlay;
