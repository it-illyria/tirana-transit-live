import { createContext, useContext } from "react";

export type Lang = "en" | "sq";

export const translations = {
  en: {
    appTitle: "Tirana Bus Tracker",
    findBus: "Find your bus",
    searchPlaceholder: "Search routes or stops...",
    myLocation: "My location",
    routes: "Routes",
    stops: "Stops",
    nearbyStops: "Nearby Stops",
    noResults: "No results found",
    arrivalIn: "Arrives in",
    minutes: "min",
    language: "ENG",
    allRoutes: "All Routes",
    liveTracking: "Live Tracking",
    dragUp: "Drag up for more",
  },
  sq: {
    appTitle: "Gjurmues Autobusi Tiranë",
    findBus: "Gjej autobusin tënd",
    searchPlaceholder: "Kërko linja ose stacione...",
    myLocation: "Vendndodhja ime",
    routes: "Linjat",
    stops: "Stacionet",
    nearbyStops: "Stacione Afër",
    noResults: "Nuk u gjetën rezultate",
    arrivalIn: "Mbërrin në",
    minutes: "min",
    language: "ALB",
    allRoutes: "Të gjitha linjat",
    liveTracking: "Gjurmim Live",
    dragUp: "Tërhiq lart për më shumë",
  },
} as const;

export type Translations = typeof translations.en;

export interface I18nContextType {
  lang: Lang;
  t: Translations;
  toggleLang: () => void;
}

export const I18nContext = createContext<I18nContextType>({
  lang: "en",
  t: translations.en,
  toggleLang: () => {},
});

export const useI18n = () => useContext(I18nContext);
