import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { GTFSData, SimulatedBus } from "@/lib/gtfs-types";
import { loadGTFSData } from "@/lib/gtfs-loader";
import { generateSimulatedBuses, updateBusPositions } from "@/lib/bus-simulator";

interface GTFSContextType {
  data: GTFSData | null;
  loading: boolean;
  error: string | null;
  progress: string;
  buses: SimulatedBus[];
  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
  selectedBusId: string | null;
  setSelectedBusId: (id: string | null) => void;
  retry: () => void;
}

const GTFSContext = createContext<GTFSContextType>({
  data: null,
  loading: true,
  error: null,
  progress: "",
  buses: [],
  selectedRouteId: null,
  setSelectedRouteId: () => {},
  selectedBusId: null,
  setSelectedBusId: () => {},
  retry: () => {},
});

export const useGTFS = () => useContext(GTFSContext);

export function GTFSProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<GTFSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [buses, setBuses] = useState<SimulatedBus[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const busInterval = useRef<ReturnType<typeof setInterval>>();
  const dataRef = useRef<GTFSData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const gtfs = await loadGTFSData(setProgress);
      setData(gtfs);
      dataRef.current = gtfs;
      const initialBuses = generateSimulatedBuses(gtfs);
      setBuses(initialBuses);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update bus positions every 10 seconds
  useEffect(() => {
    if (!data) return;
    busInterval.current = setInterval(() => {
      setBuses((prev) => {
        if (!dataRef.current) return prev;
        return updateBusPositions(prev, dataRef.current);
      });
    }, 10000);

    return () => {
      if (busInterval.current) clearInterval(busInterval.current);
    };
  }, [data]);

  return (
    <GTFSContext.Provider
      value={{
        data,
        loading,
        error,
        progress,
        buses,
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
