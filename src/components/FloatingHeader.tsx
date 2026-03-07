import { Bus, Globe } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const FloatingHeader = () => {
  const { lang, t, toggleLang } = useI18n();

  return (
    <header className="fixed top-0 left-0 right-0 z-[1000] pointer-events-none px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass-surface shadow-float rounded-xl px-4 py-3 flex items-center justify-between pointer-events-auto max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Bus className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
            {t.appTitle}
          </h1>
        </div>

        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-sm font-medium text-foreground transition-colors"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4 text-muted-foreground" />
          <span>{lang === "en" ? "ALB" : "ENG"}</span>
        </button>
      </div>
    </header>
  );
};

export default FloatingHeader;
