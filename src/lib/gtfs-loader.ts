import JSZip from "jszip";
import Papa from "papaparse";
import type { GTFSData, GTFSRoute, GTFSStop, GTFSTrip, GTFSStopTime, GTFSShape } from "./gtfs-types";

const GTFS_URL = "https://transitous.org/feeds/municipality-of-tirana~gtfs.zip";
const CORS_PROXY = "https://corsproxy.io/?url=";
const CACHE_KEY = "tirana_gtfs_data";
const CACHE_TS_KEY = "tirana_gtfs_timestamp";
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function parseCSV<T>(text: string): T[] {
  const result = Papa.parse<T>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return result.data;
}

export async function loadGTFSData(
  onProgress?: (msg: string) => void
): Promise<GTFSData> {
  // Check cache
  const cachedTs = localStorage.getItem(CACHE_TS_KEY);
  if (cachedTs && Date.now() - parseInt(cachedTs) < CACHE_DURATION) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      onProgress?.("Loading from cache...");
      try {
        return JSON.parse(cached);
      } catch {
        // Cache corrupted, fetch fresh
      }
    }
  }

  onProgress?.("Downloading GTFS feed...");
  const response = await fetch(CORS_PROXY + encodeURIComponent(GTFS_URL));
  if (!response.ok) throw new Error(`Failed to fetch GTFS: ${response.status}`);

  const blob = await response.blob();
  onProgress?.("Extracting data...");
  const zip = await JSZip.loadAsync(blob);

  const readFile = async (name: string): Promise<string> => {
    const file = zip.file(name);
    if (!file) return "";
    return file.async("text");
  };

  onProgress?.("Parsing routes...");
  const routesRaw = parseCSV<Record<string, string>>(await readFile("routes.txt"));
  const routes: GTFSRoute[] = routesRaw.map((r) => ({
    route_id: r.route_id || "",
    route_short_name: r.route_short_name || "",
    route_long_name: r.route_long_name || "",
    route_color: r.route_color ? `#${r.route_color}` : "#0066CC",
    route_type: r.route_type || "3",
  }));

  onProgress?.("Parsing stops...");
  const stopsRaw = parseCSV<Record<string, string>>(await readFile("stops.txt"));
  const stops: GTFSStop[] = stopsRaw
    .filter((s) => s.stop_lat && s.stop_lon)
    .map((s) => ({
      stop_id: s.stop_id || "",
      stop_name: s.stop_name || "",
      stop_lat: parseFloat(s.stop_lat),
      stop_lon: parseFloat(s.stop_lon),
    }));

  onProgress?.("Parsing trips...");
  const tripsRaw = parseCSV<Record<string, string>>(await readFile("trips.txt"));
  const trips: GTFSTrip[] = tripsRaw.map((t) => ({
    trip_id: t.trip_id || "",
    route_id: t.route_id || "",
    service_id: t.service_id || "",
    trip_headsign: t.trip_headsign || "",
    direction_id: t.direction_id || "0",
    shape_id: t.shape_id || "",
  }));

  onProgress?.("Parsing stop times...");
  const stRaw = parseCSV<Record<string, string>>(await readFile("stop_times.txt"));
  const stopTimes: GTFSStopTime[] = stRaw.map((s) => ({
    trip_id: s.trip_id || "",
    arrival_time: s.arrival_time || "",
    departure_time: s.departure_time || "",
    stop_id: s.stop_id || "",
    stop_sequence: parseInt(s.stop_sequence) || 0,
  }));

  onProgress?.("Parsing shapes...");
  let shapes: GTFSShape[] = [];
  const shapesText = await readFile("shapes.txt");
  if (shapesText) {
    const shapesRaw = parseCSV<Record<string, string>>(shapesText);
    shapes = shapesRaw.map((s) => ({
      shape_id: s.shape_id || "",
      shape_pt_lat: parseFloat(s.shape_pt_lat),
      shape_pt_lon: parseFloat(s.shape_pt_lon),
      shape_pt_sequence: parseInt(s.shape_pt_sequence) || 0,
    }));
  }

  const data: GTFSData = { routes, stops, trips, stopTimes, shapes };

  // Cache
  onProgress?.("Caching data...");
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  } catch {
    // Storage full, skip caching
  }

  return data;
}
