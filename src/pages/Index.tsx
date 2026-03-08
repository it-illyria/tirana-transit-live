import { useState, useMemo } from "react";
import { I18nContext, translations, type Lang } from "@/lib/i18n";
import { GTFSProvider } from "@/contexts/GTFSContext";
import MapView from "@/components/MapView";
import FloatingHeader from "@/components/FloatingHeader";
import BottomSheet from "@/components/BottomSheet";
import RouteDetailView from "@/components/RouteDetailView";
import TripPlannerModal from "@/components/TripPlannerModal";
import LoadingOverlay from "@/components/LoadingOverlay";
import OfflineIndicator from "@/components/OfflineIndicator";
import NearestStopWidget from "@/components/NearestStopWidget";
import { useFavoriteAlerts } from "@/hooks/useFavoriteAlerts";

function FavoriteAlertsRunner() {
  useFavoriteAlerts();
  return null;
}

const Index = () => {
  const [lang, setLang] = useState<Lang>("sq");
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);

  const i18n = useMemo(
    () => ({
      lang,
      t: translations[lang] as { [K in keyof typeof translations.en]: string },
      toggleLang: () => setLang((l) => (l === "en" ? "sq" : "en")),
    }),
    [lang]
  );

  return (
    <I18nContext.Provider value={i18n}>
      <GTFSProvider>
        <div className="relative w-full h-screen overflow-hidden">
          <MapView />
          <FloatingHeader onPlanTrip={() => setTripPlannerOpen(true)} />
          <BottomSheet />
          <RouteDetailView />
          <FavoriteAlertsRunner />
          <NearestStopWidget />
          <LoadingOverlay />
          <OfflineIndicator />
          <TripPlannerModal open={tripPlannerOpen} onClose={() => setTripPlannerOpen(false)} />
        </div>
      </GTFSProvider>
    </I18nContext.Provider>
  );
};

export default Index;
