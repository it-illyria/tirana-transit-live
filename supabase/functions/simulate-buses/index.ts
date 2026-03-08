import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";
import Papa from "https://esm.sh/papaparse@5.5.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface SimulatedBus {
  vehicle_id: string;
  route_id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  timestamp: number;
  route_color: string;
  route_name: string;
  progress: number;
  next_stop_name: string;
  next_stop_id: string;
  eta_minutes: number;
  status: "in_transit" | "at_stop" | "delayed";
  passengers: number;
  direction_id: string;
  moving_forward: boolean;
}

interface RoutePath {
  routeId: string;
  tripId: string;
  directionId: string;
  points: [number, number][];
  totalDistance: number;
  segmentDistances: number[];
  stops: { stopId: string; name: string; distanceAlong: number }[];
  routeColor: string;
  routeName: string;
}

interface BusState {
  buses: SimulatedBus[];
  paths: RoutePath[];
  lastUpdate: number;
}

// ─── Redis helpers ───────────────────────────────────────────────────────────

async function redisGet(url: string, token: string, key: string): Promise<string | null> {
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result ?? null;
}

async function redisSet(url: string, token: string, key: string, value: string, exSeconds?: number): Promise<void> {
  const parts = [key, value];
  if (exSeconds) parts.push("EX", String(exSeconds));
  await fetch(`${url}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", ...parts]),
  });
}

// ─── Geo math ────────────────────────────────────────────────────────────────

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function interpolateAlongPath(
  points: [number, number][],
  segmentDistances: number[],
  totalDistance: number,
  progress: number,
): { lat: number; lon: number; heading: number } {
  const targetDist = progress * totalDistance;
  let accumulated = 0;
  for (let i = 0; i < segmentDistances.length; i++) {
    if (accumulated + segmentDistances[i] >= targetDist) {
      const f = segmentDistances[i] > 0 ? (targetDist - accumulated) / segmentDistances[i] : 0;
      const [lat1, lon1] = points[i];
      const [lat2, lon2] = points[i + 1];
      return {
        lat: lat1 + (lat2 - lat1) * f,
        lon: lon1 + (lon2 - lon1) * f,
        heading: bearing(lat1, lon1, lat2, lon2),
      };
    }
    accumulated += segmentDistances[i];
  }
  const last = points[points.length - 1];
  const prev = points[Math.max(0, points.length - 2)];
  return { lat: last[0], lon: last[1], heading: bearing(prev[0], prev[1], last[0], last[1]) };
}

// ─── Speed & Operating Hours ─────────────────────────────────────────────────

const BASE_SPEED_KMH = 18;

// Tirana buses: first departures ~5:00, last departures ~20:30-21:00
// After 21:00, only remaining return ("kthim") trips finish by ~22:00-22:30
// By 23:00 all buses are parked
const SERVICE_START_HOUR = 5;
const LAST_DEPARTURE_HOUR = 21;  // last outbound departures
const SERVICE_END_HOUR = 23;      // absolute end (last return trips finish)
const RAMP_UP_MINUTES = 60;       // 5:00-6:00 gradual start
const RAMP_DOWN_MINUTES = 120;    // 21:00-23:00 gradual wind-down

/** Get current Tirana local time (Europe/Tirane: UTC+1 CET / UTC+2 CEST) */
function getTiranaTime(): Date {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Tirane",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0");
  const local = new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local;
}

/**
 * Fleet fraction: 0.0–1.0
 * - 5:00-6:00: ramp up 0→1
 * - 6:00-20:00: full service (1.0, 0.8 weekends)
 * - 20:00-21:00: start reducing (0.6-0.3)
 * - 21:00-22:30: only return trips, ~10-20% fleet
 * - 22:30-23:00: last buses parking
 * - 23:00-5:00: no service
 */
function getFleetFraction(): number {
  const now = getTiranaTime();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const totalMin = hour * 60 + minute;

  const startMin = SERVICE_START_HOUR * 60;       // 300
  const lastDepMin = LAST_DEPARTURE_HOUR * 60;    // 1260
  const endMin = SERVICE_END_HOUR * 60;            // 1380

  // Dead of night
  if (totalMin < startMin || totalMin >= endMin) return 0;

  // Morning ramp-up: 5:00-6:00
  if (totalMin < startMin + RAMP_UP_MINUTES) {
    return (totalMin - startMin) / RAMP_UP_MINUTES;
  }

  // Evening wind-down starts at 20:00
  const eveningStartMin = 20 * 60; // 1200
  if (totalMin >= eveningStartMin) {
    // 20:00-21:00: reduce to ~30%
    if (totalMin < lastDepMin) {
      return 0.3 + 0.7 * (1 - (totalMin - eveningStartMin) / 60);
    }
    // 21:00-22:30: only ~10-15% (return trips)
    if (totalMin < endMin - 30) {
      const progress = (totalMin - lastDepMin) / (endMin - 30 - lastDepMin);
      return Math.max(0.05, 0.15 * (1 - progress));
    }
    // 22:30-23:00: last few buses finishing
    return 0.03;
  }

  // Weekend: slightly reduced
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return 0.8;
  return 1.0;
}

/** Whether we're in "return trips only" mode (after last departures) */
function isReturnTripsOnly(): boolean {
  const totalMin = (() => {
    const t = getTiranaTime();
    return t.getHours() * 60 + t.getMinutes();
  })();
  return totalMin >= LAST_DEPARTURE_HOUR * 60;
}

function getSpeedMultiplier(): number {
  const hour = getTiranaTime().getHours();
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) return 0.6;
  if (hour >= 22 || hour <= 6) return 1.3;
  return 1.0;
}

// ─── GTFS parsing ────────────────────────────────────────────────────────────

function parseCSV<T>(text: string): T[] {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  return result.data as T[];
}

async function loadGTFS(supabase: any) {
  const { data, error } = await supabase.storage.from("gtfs-cache").download("al_tirana.gtfs.zip");
  if (error || !data) throw new Error("GTFS cache not found – call fetch-gtfs first");

  const buf = await data.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const read = async (name: string) => {
    const f = zip.file(name);
    return f ? f.async("text") : "";
  };

  const routesRaw = parseCSV<Record<string, string>>(await read("routes.txt"));
  const routes = routesRaw.map((r: any) => ({
    route_id: r.route_id || "",
    route_short_name: r.route_short_name || "",
    route_long_name: r.route_long_name || "",
    route_color: r.route_color ? `#${r.route_color}` : "#0066CC",
    route_type: r.route_type || "3",
  }));

  const stopsRaw = parseCSV<Record<string, string>>(await read("stops.txt"));
  const stops = stopsRaw
    .filter((s: any) => s.stop_lat && s.stop_lon)
    .map((s: any) => ({
      stop_id: s.stop_id || "",
      stop_name: s.stop_name || "",
      stop_lat: parseFloat(s.stop_lat),
      stop_lon: parseFloat(s.stop_lon),
    }));

  const tripsRaw = parseCSV<Record<string, string>>(await read("trips.txt"));
  const trips = tripsRaw.map((t: any) => ({
    trip_id: t.trip_id || "",
    route_id: t.route_id || "",
    service_id: t.service_id || "",
    trip_headsign: t.trip_headsign || "",
    direction_id: t.direction_id || "0",
    shape_id: t.shape_id || "",
  }));

  const stRaw = parseCSV<Record<string, string>>(await read("stop_times.txt"));
  const stopTimes = stRaw.map((s: any) => ({
    trip_id: s.trip_id || "",
    arrival_time: s.arrival_time || "",
    departure_time: s.departure_time || "",
    stop_id: s.stop_id || "",
    stop_sequence: parseInt(s.stop_sequence) || 0,
  }));

  const shapesText = await read("shapes.txt");
  const shapes = shapesText
    ? parseCSV<Record<string, string>>(shapesText).map((s: any) => ({
        shape_id: s.shape_id || "",
        shape_pt_lat: parseFloat(s.shape_pt_lat),
        shape_pt_lon: parseFloat(s.shape_pt_lon),
        shape_pt_sequence: parseInt(s.shape_pt_sequence) || 0,
      }))
    : [];

  return { routes, stops, trips, stopTimes, shapes };
}

// ─── Build route paths ──────────────────────────────────────────────────────

function buildRoutePaths(data: any): RoutePath[] {
  const paths: RoutePath[] = [];
  const routeMap = new Map(data.routes.map((r: any) => [r.route_id, r]));
  const stopMap = new Map(data.stops.map((s: any) => [s.stop_id, s]));

  const shapeGroups = new Map<string, any[]>();
  for (const s of data.shapes) {
    const g = shapeGroups.get(s.shape_id) || [];
    g.push(s);
    shapeGroups.set(s.shape_id, g);
  }

  const seenRouteDir = new Set<string>();
  const selected: any[] = [];
  for (const trip of data.trips) {
    const key = `${trip.route_id}_${trip.direction_id}`;
    if (seenRouteDir.has(key)) continue;
    seenRouteDir.add(key);
    selected.push(trip);
  }

  const tripStopTimes = new Map<string, any[]>();
  for (const st of data.stopTimes) {
    const arr = tripStopTimes.get(st.trip_id) || [];
    arr.push({ stop_id: st.stop_id, seq: st.stop_sequence });
    tripStopTimes.set(st.trip_id, arr);
  }

  for (const sel of selected) {
    const route: any = routeMap.get(sel.route_id);
    if (!route) continue;

    let points: [number, number][] = [];
    const sp = shapeGroups.get(sel.shape_id);
    if (sp && sp.length > 1) {
      points = sp
        .sort((a: any, b: any) => a.shape_pt_sequence - b.shape_pt_sequence)
        .map((s: any) => [s.shape_pt_lat, s.shape_pt_lon] as [number, number]);
    } else {
      const ts = tripStopTimes.get(sel.trip_id);
      if (!ts || ts.length < 2) continue;
      ts.sort((a: any, b: any) => a.seq - b.seq);
      points = ts
        .map((t: any) => {
          const s: any = stopMap.get(t.stop_id);
          return s ? ([s.stop_lat, s.stop_lon] as [number, number]) : null;
        })
        .filter(Boolean) as [number, number][];
    }
    if (points.length < 2) continue;

    const segmentDistances: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const d = haversine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      segmentDistances.push(d);
      totalDistance += d;
    }
    if (totalDistance < 0.1) continue;

    const ts = tripStopTimes.get(sel.trip_id) || [];
    ts.sort((a: any, b: any) => a.seq - b.seq);
    const stopsAlongRoute: RoutePath["stops"] = [];
    for (const t of ts) {
      const stop: any = stopMap.get(t.stop_id);
      if (!stop) continue;
      let minDist = Infinity, bestAlong = 0, acc = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const d = haversine(stop.stop_lat, stop.stop_lon, points[i][0], points[i][1]);
        if (d < minDist) { minDist = d; bestAlong = acc; }
        acc += segmentDistances[i];
      }
      const dLast = haversine(stop.stop_lat, stop.stop_lon, points[points.length - 1][0], points[points.length - 1][1]);
      if (dLast < minDist) bestAlong = totalDistance;
      stopsAlongRoute.push({ stopId: t.stop_id, name: stop.stop_name, distanceAlong: bestAlong / totalDistance });
    }
    stopsAlongRoute.sort((a, b) => a.distanceAlong - b.distanceAlong);

    paths.push({
      routeId: sel.route_id,
      tripId: sel.trip_id,
      directionId: sel.direction_id,
      points,
      totalDistance,
      segmentDistances,
      stops: stopsAlongRoute,
      routeColor: route.route_color,
      routeName: route.route_short_name || route.route_long_name,
    });
  }
  return paths;
}

// ─── Generate initial buses (respects operating hours) ───────────────────────
// Buses are generated on BOTH directions of each route. Each bus does round trips:
// moving_forward=true → progress 0→1, moving_forward=false → progress 1→0

function generateBuses(paths: RoutePath[]): SimulatedBus[] {
  const fleetFraction = getFleetFraction();
  if (fleetFraction <= 0) return [];

  const returnOnly = isReturnTripsOnly();

  // Group paths by routeId to create round-trip pairs
  const routePaths = new Map<string, RoutePath[]>();
  for (const p of paths) {
    const arr = routePaths.get(p.routeId) || [];
    arr.push(p);
    routePaths.set(p.routeId, arr);
  }

  const buses: SimulatedBus[] = [];
  let idx = 0;

  for (const [routeId, rpaths] of routePaths) {
    const primaryPath = rpaths[0];
    const maxCount = Math.min(2 + Math.floor(primaryPath.totalDistance / 5), 4);
    const count = Math.max(1, Math.round(maxCount * fleetFraction));

    for (let b = 0; b < count; b++) {
      // After last departures: all buses are on return ("kthim") trips
      const goingForward = returnOnly ? false : (b % 2 === 0);

      const dirPath = rpaths.length > 1
        ? rpaths[goingForward ? 0 : 1]
        : primaryPath;

      // Late night buses: position them mid-to-late in their return trip
      const progress = returnOnly
        ? 0.3 + Math.random() * 0.5  // somewhere mid-route heading back
        : (b / count + Math.random() * 0.05) % 1;
      const effectiveProgress = goingForward ? progress : 1 - progress;

      const pos = interpolateAlongPath(dirPath.points, dirPath.segmentDistances, dirPath.totalDistance, effectiveProgress);
      const sm = getSpeedMultiplier();

      const nextStop = goingForward
        ? dirPath.stops.find((s) => s.distanceAlong > effectiveProgress) || dirPath.stops[dirPath.stops.length - 1]
        : [...dirPath.stops].reverse().find((s) => s.distanceAlong < effectiveProgress) || dirPath.stops[0];

      const distToNext = nextStop ? Math.abs(nextStop.distanceAlong - effectiveProgress) * dirPath.totalDistance : 0;
      const eta = distToNext > 0 ? (distToNext / (BASE_SPEED_KMH * sm)) * 60 : 0;

      buses.push({
        vehicle_id: `TR-${String(idx++).padStart(3, "0")}`,
        route_id: routeId,
        trip_id: dirPath.tripId,
        latitude: pos.lat,
        longitude: pos.lon,
        heading: goingForward ? pos.heading : (pos.heading + 180) % 360,
        speed: BASE_SPEED_KMH * sm * (0.8 + Math.random() * 0.4),
        timestamp: Date.now(),
        route_color: dirPath.routeColor,
        route_name: dirPath.routeName,
        progress: effectiveProgress,
        next_stop_name: nextStop?.name || "",
        next_stop_id: nextStop?.stopId || "",
        eta_minutes: Math.round(eta),
        status: Math.random() < 0.1 ? "at_stop" : "in_transit",
        passengers: returnOnly ? Math.floor(Math.random() * 15) + 2 : Math.floor(Math.random() * 50) + 5,
        direction_id: dirPath.directionId,
        moving_forward: goingForward,
      });
    }
  }
  return buses;
}

// ─── Update bus positions (with round-trip & operating hours) ────────────────

function updateBuses(state: BusState): SimulatedBus[] {
  const fleetFraction = getFleetFraction();
  if (fleetFraction <= 0) return [];

  const returnOnly = isReturnTripsOnly();

  const pathMap = new Map<string, RoutePath>();
  for (const p of state.paths) pathMap.set(`${p.routeId}_${p.directionId}`, p);

  const routePaths = new Map<string, RoutePath[]>();
  for (const p of state.paths) {
    const arr = routePaths.get(p.routeId) || [];
    arr.push(p);
    routePaths.set(p.routeId, arr);
  }

  const elapsed = (Date.now() - state.lastUpdate) / 1000;
  const sm = getSpeedMultiplier();

  const targetCount = Math.max(1, Math.round(state.buses.length * fleetFraction));
  let activeBuses = state.buses;

  // During ramp-down: remove parked buses (speed=0, at terminus) first
  if (fleetFraction < 1 && activeBuses.length > targetCount) {
    const parked = activeBuses.filter(b => b.speed === 0 && (b.progress <= 0.01 || b.progress >= 0.99));
    const moving = activeBuses.filter(b => !(b.speed === 0 && (b.progress <= 0.01 || b.progress >= 0.99)));
    activeBuses = [...moving, ...parked.slice(0, Math.max(0, targetCount - moving.length))];
  }

  // In return-only mode, force any forward-moving buses to start returning
  if (returnOnly) {
    activeBuses = activeBuses.map(b => {
      if (b.moving_forward && b.progress > 0.5) {
        return { ...b, moving_forward: false };
      }
      return b;
    });
  }

  return activeBuses.map((bus) => {
    let directionId = bus.direction_id;
    let movingForward = bus.moving_forward;
    const path = pathMap.get(`${bus.route_id}_${directionId}`);
    if (!path || path.totalDistance < 0.1) return { ...bus, timestamp: Date.now() };

    const speed = BASE_SPEED_KMH * sm * (0.8 + Math.random() * 0.4);
    const distKm = (speed * elapsed) / 3600;
    const progressDelta = distKm / path.totalDistance;

    // Move forward or backward based on direction
    let newProgress = movingForward
      ? bus.progress + progressDelta
      : bus.progress - progressDelta;

    const wasAtStop = bus.status === "at_stop";
    let newStatus: SimulatedBus["status"] = "in_transit";

    // Reached the END of route (outbound terminus)
    if (newProgress >= 0.995) {
      // After last departures OR during heavy ramp-down: bus is done, park it
      if (returnOnly || (fleetFraction < 0.3 && !movingForward === false)) {
        // Bus reached terminus — if going forward, turn around for return
        // If already returning and reached end, park
        if (!movingForward) {
          // Return trip complete — this bus is done for the night
          return { ...bus, progress: 1.0, speed: 0, status: "at_stop" as const, timestamp: Date.now(), moving_forward: false };
        }
      }

      if (!wasAtStop) {
        newProgress = 1.0;
        newStatus = "at_stop";
      } else {
        // Turn around for return trip
        if (returnOnly) {
          // After last departures: MUST go back, no new outbound trips
          movingForward = false;
          newProgress = 1.0 - progressDelta;
        } else {
          const rpaths = routePaths.get(bus.route_id) || [];
          const oppositePath = rpaths.find(p => p.directionId !== directionId);
          if (oppositePath) {
            directionId = oppositePath.directionId;
            movingForward = true;
            newProgress = 0.0;
          } else {
            movingForward = false;
            newProgress = 1.0 - progressDelta;
          }
        }
        newStatus = "in_transit";
      }
    }
    // Reached the START of route (return terminus — bus completed return trip)
    else if (newProgress <= 0.005) {
      // After last departures: bus completed its return, park it
      if (returnOnly && !movingForward) {
        return { ...bus, progress: 0.0, speed: 0, status: "at_stop" as const, timestamp: Date.now(), moving_forward: false };
      }

      if (!wasAtStop) {
        newProgress = 0.0;
        newStatus = "at_stop";
      } else {
        if (returnOnly) {
          // Don't start new outbound — bus is parked
          return { ...bus, progress: 0.0, speed: 0, status: "at_stop" as const, timestamp: Date.now(), moving_forward: false };
        }
        // Normal hours: turn around for new outbound trip
        const rpaths = routePaths.get(bus.route_id) || [];
        const oppositePath = rpaths.find(p => p.directionId !== directionId);
        if (oppositePath) {
          directionId = oppositePath.directionId;
          movingForward = true;
          newProgress = 0.0;
        } else {
          movingForward = true;
          newProgress = progressDelta;
        }
        newStatus = "in_transit";
      }
    }
    // Mid-route: check for intermediate stops
    else {
      const activePath = pathMap.get(`${bus.route_id}_${directionId}`) || path;
      const nearStop = activePath.stops.find((s) => Math.abs(s.distanceAlong - newProgress) < 0.005);
      if (nearStop && !wasAtStop && Math.random() < 0.3) {
        newStatus = "at_stop";
        newProgress = bus.progress; // stay at stop
      }
    }

    const activePath = pathMap.get(`${bus.route_id}_${directionId}`) || path;
    const clampedProgress = Math.max(0, Math.min(1, newProgress));
    const pos = interpolateAlongPath(activePath.points, activePath.segmentDistances, activePath.totalDistance, clampedProgress);

    // Heading: flip 180° when going in reverse
    const heading = movingForward ? pos.heading : (pos.heading + 180) % 360;

    // Next stop depends on direction of travel
    const nextStop = movingForward
      ? activePath.stops.find((s) => s.distanceAlong > clampedProgress) || activePath.stops[activePath.stops.length - 1]
      : [...activePath.stops].reverse().find((s) => s.distanceAlong < clampedProgress) || activePath.stops[0];

    const distToNext = nextStop ? Math.abs(nextStop.distanceAlong - clampedProgress) * activePath.totalDistance : 0;
    const eta = distToNext > 0 ? (distToNext / speed) * 60 : 0;
    const pDelta = newStatus === "at_stop" ? Math.floor(Math.random() * 8 - 3) : 0;

    return {
      ...bus,
      latitude: pos.lat,
      longitude: pos.lon,
      heading,
      speed: newStatus === "at_stop" ? 0 : speed,
      timestamp: Date.now(),
      progress: clampedProgress,
      direction_id: directionId,
      next_stop_name: nextStop?.name || bus.next_stop_name,
      next_stop_id: nextStop?.stopId || bus.next_stop_id,
      eta_minutes: Math.round(eta),
      status: newStatus,
      passengers: Math.max(0, Math.min(60, bus.passengers + pDelta)),
      moving_forward: movingForward,
    };
  });
}

// ─── GTFS-RT probe ──────────────────────────────────────────────────────────
// Tirana has GTFS-RT integrated with Google Maps via ATD/GIZ, but the feed
// is not publicly accessible. We probe known endpoint patterns and fall back
// to simulation if unavailable.

const GTFS_RT_ENDPOINTS = [
  "https://pt.tirana.al/gtfs-rt/vehicle-positions",
  "https://pt.tirana.al/gtfs-rt/vehiclepositions.pb",
  "https://pt.tirana.al/api/realtime/vehicle-positions",
];

async function tryGtfsRt(): Promise<SimulatedBus[] | null> {
  for (const url of GTFS_RT_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3000),
        headers: { "Accept": "application/x-protobuf, application/json" },
      });
      if (!res.ok) continue;

      // If we get JSON back, try to parse vehicle positions
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("json")) {
        const data = await res.json();
        if (data.entity && Array.isArray(data.entity)) {
          console.log(`GTFS-RT feed found at ${url} with ${data.entity.length} vehicles`);
          return data.entity
            .filter((e: any) => e.vehicle?.position)
            .map((e: any, i: number) => ({
              vehicle_id: e.vehicle?.vehicle?.id || `RT-${i}`,
              route_id: e.vehicle?.trip?.routeId || "",
              trip_id: e.vehicle?.trip?.tripId || "",
              latitude: e.vehicle.position.latitude,
              longitude: e.vehicle.position.longitude,
              heading: e.vehicle.position.bearing || 0,
              speed: (e.vehicle.position.speed || 0) * 3.6,
              timestamp: Date.now(),
              route_color: "#0066CC",
              route_name: e.vehicle?.trip?.routeId || "?",
              progress: 0.5,
              next_stop_name: "",
              next_stop_id: "",
              eta_minutes: 0,
              status: "in_transit" as const,
              passengers: 0,
              direction_id: e.vehicle?.trip?.directionId?.toString() || "0",
              moving_forward: true,
            }));
        }
      }
      // Protobuf parsing would need a library — skip for now
    } catch {
      // Timeout or network error — try next endpoint
    }
  }
  return null;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const REDIS_URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const REDIS_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!REDIS_URL || !REDIS_TOKEN) {
    return new Response(JSON.stringify({ error: "Redis not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Check operating hours first
    const fleetFraction = getFleetFraction();
    if (fleetFraction <= 0) {
      // Service is not running — compute resume time in Tirana timezone
      const tiranaNow = getTiranaTime();
      const tiranaHour = tiranaNow.getHours();

      // Next service start: today at 5:00 if before 5am, otherwise tomorrow 5:00
      const resumeLocal = new Date(tiranaNow);
      resumeLocal.setHours(SERVICE_START_HOUR, 0, 0, 0);
      if (tiranaHour >= SERVICE_START_HOUR) {
        resumeLocal.setDate(resumeLocal.getDate() + 1);
      }

      // Convert Tirana local back to UTC for ISO string
      // Get the offset: Tirana is UTC+1 (CET) or UTC+2 (CEST)
      const nowUtc = new Date();
      const tiranaOffset = (tiranaNow.getTime() - nowUtc.getTime()); // approximate ms offset
      const resumeUtc = new Date(resumeLocal.getTime() - tiranaOffset + nowUtc.getTime() - tiranaNow.getTime());
      // Simpler: just send the local time as a string for the client
      const resumeIso = `${resumeLocal.getFullYear()}-${String(resumeLocal.getMonth() + 1).padStart(2, "0")}-${String(resumeLocal.getDate()).padStart(2, "0")}T${String(SERVICE_START_HOUR).padStart(2, "0")}:00:00+01:00`;

      return new Response(JSON.stringify({
        buses: [],
        cached: false,
        serviceStatus: "night",
        message: `Shërbimi i autobusëve nuk është aktiv.`,
        resumesAt: resumeIso,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try GTFS-RT first (real-time data from Tirana's system)
    const rtBuses = await tryGtfsRt();
    if (rtBuses && rtBuses.length > 0) {
      return new Response(JSON.stringify({
        buses: rtBuses,
        cached: false,
        source: "gtfs-rt",
        serviceStatus: "active",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: simulation
    // Try Redis cache first
    const cached = await redisGet(REDIS_URL, REDIS_TOKEN, "bus_state");
    if (cached) {
      const state: BusState = JSON.parse(cached);
      const age = Date.now() - state.lastUpdate;

      if (age < 8000) {
        return new Response(JSON.stringify({
          buses: state.buses,
          cached: true,
          age,
          source: "simulation",
          serviceStatus: "active",
          fleetFraction,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Stale – update positions
      const updatedBuses = updateBuses(state);
      const newState: BusState = { buses: updatedBuses, paths: state.paths, lastUpdate: Date.now() };
      await redisSet(REDIS_URL, REDIS_TOKEN, "bus_state", JSON.stringify(newState), 300);

      return new Response(JSON.stringify({
        buses: updatedBuses,
        cached: false,
        age,
        source: "simulation",
        serviceStatus: "active",
        fleetFraction,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No cache – initialize from GTFS
    console.log("Initializing bus simulation from GTFS...");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const gtfs = await loadGTFS(supabase);
    const paths = buildRoutePaths(gtfs);
    const buses = generateBuses(paths);

    const state: BusState = { buses, paths, lastUpdate: Date.now() };
    await redisSet(REDIS_URL, REDIS_TOKEN, "bus_state", JSON.stringify(state), 300);

    return new Response(JSON.stringify({
      buses,
      cached: false,
      initialized: true,
      source: "simulation",
      serviceStatus: "active",
      fleetFraction,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("simulate-buses error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
