import { useState, useMemo } from "react";
import { I18nContext, translations, type Lang } from "@/lib/i18n";
import MapView from "@/components/MapView";
import FloatingHeader from "@/components/FloatingHeader";
import BottomSheet from "@/components/BottomSheet";

const Index = () => {
  const [lang, setLang] = useState<Lang>("en");

  const i18n = useMemo(
    () => ({
      lang,
      t: translations[lang],
      toggleLang: () => setLang((l) => (l === "en" ? "sq" : "en")),
    }),
    [lang]
  );

  return (
    <I18nContext.Provider value={i18n}>
      <div className="relative w-full h-screen overflow-hidden">
        <MapView />
        <FloatingHeader />
        <BottomSheet />
      </div>
    </I18nContext.Provider>
  );
};

export default Index;
