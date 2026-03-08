import { useState } from "react";
import { Bell, Bus, Globe, Navigation, Moon, Sun, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/use-theme";
import NotificationSettingsPanel from "@/components/NotificationSettingsPanel";
import FavoritesPanel from "@/components/FavoritesPanel";

interface Props {
  onPlanTrip: () => void;
}

const FloatingHeader = ({ onPlanTrip }: Props) => {
  const { lang, t, toggleLang } = useI18n();
  const [notifOpen, setNotifOpen] = useState(false);
  const [favsOpen, setFavsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <>
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

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setFavsOpen(true)}
              className="p-2 rounded-lg bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Favorites"
            >
              <Star className="w-4 h-4" />
            </button>

            <button
              onClick={() => setNotifOpen(true)}
              className="p-2 rounded-lg bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Notification settings"
            >
              <Bell className="w-4 h-4" />
            </button>

            <button
              onClick={onPlanTrip}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors hover:opacity-90"
              aria-label={t.planTrip}
            >
              <Navigation className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.planTrip}</span>
            </button>

            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-accent text-sm font-medium text-foreground transition-colors"
              aria-label="Toggle language"
            >
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span>{lang === "en" ? "ALB" : "ENG"}</span>
            </button>
          </div>
        </div>
      </header>

      <NotificationSettingsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  );
};

export default FloatingHeader;
