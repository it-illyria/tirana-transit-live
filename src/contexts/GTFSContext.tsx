import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { GTFSData, SimulatedBus } from "@/lib/gtfs-types";
import { loadGTFSData } from "@/lib/gtfs-loader";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUS_POLL_INTERVAL = 10000; // 10 seconds

export interface BusRefreshStatus {
  lastRefresh: number | null;
  cached: boolean;
  age: number | null;
  busCount: number;
}

interface GTFSContextType {
  data: GTFSData | null;
  loading: boolean;
  error: string | null;
  progress: string;
  buses: SimulatedBus[];
  refreshStatus: BusRefreshStatus;
  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
  selectedBusId: string | null;
  setSelectedBusId: (id: string | null) => void;
  focusStopId: string | null;
  setFocusStopId: (id: string | null) => void;
  retry: () => void;
}

const GTFSContext = createContext<GTFSContextType>({
  data: null,
  loading: true,
  error: null,
  progress: "",
  buses: [],
  refreshStatus: { lastRefresh: null, cached: false, age: null, busCount: 0 },
  selectedRouteId: null,
  setSelectedRouteId: () => {},
  selectedBusId: null,
  setSelectedBusId: () => {},
  focusStopId: null,
  setFocusStopId: () => {},
  retry: () => {},
});

export const useGTFS = () => useContext(GTFSContext);

export function GTFSProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GTFSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [buses, setBuses] = useState<SimulatedBus[]>([]);
  const [refreshStatus, setRefreshStatus] = useState<BusRefreshStatus>({
    lastRefresh: null,
    cached: false,
    age: null,
    busCount: 0,
  });
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const pollInterval = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gtfs = await loadGTFSData(setProgress);
      setData(gtfs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, []);

  // Fetch bus positions from server
  const fetchBuses = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/simulate-buses`);
      if (!res.ok) {
        console.error("Bus fetch failed:", res.status);
        return;
      }
      const json = await res.json();
      if (json.buses && Array.isArray(json.buses)) {
        setBuses(json.buses);
        setRefreshStatus({
          lastRefresh: Date.now(),
          cached: !!json.cached,
          age: json.age ?? null,
          busCount: json.buses.length,
        });
      }
    } catch (e) {
      console.error("Bus poll error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll server for bus positions every 10s
  useEffect(() => {
    fetchBuses();
    pollInterval.current = setInterval(fetchBuses, BUS_POLL_INTERVAL);
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [fetchBuses]);

  return (
    <GTFSContext.Provider
      value={{
        data,
        loading,
        error,
        progress,
        buses,
        refreshStatus,
        selectedRouteId,
        setSelectedRouteId,
        selectedBusId,
        setSelectedBusId,
        retry: fetchData,
      }}
    >
      {children}
    </GTFSContext.Provider>
  );
}
