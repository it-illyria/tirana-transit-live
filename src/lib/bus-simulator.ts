import type { GTFSData, SimulatedBus, GTFSShape, GTFSStop } from "./gtfs-types";

/**
 * Realistic bus simulator that:
 * - Follows actual route shapes (polylines) from GTFS
 * - Uses schedule times to determine current position
 * - Shows next stop and ETA
 * - Varies speed based on time of day and route progress
 */

interface RoutePath {
  routeId: string;
  tripId: string;
  directionId: string;
  points: [number, number][]; // [lat, lon]
  totalDistance: number;
  segmentDistances: number[];
  stops: { stopId: string; name: string; distanceAlong: number }[];
  routeColor: string;
  routeName: string;
}

// Haversine distance in km
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
  progress: number
): { lat: number; lon: number; heading: number } {
  const targetDist = progress * totalDistance;
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    if (accumulated + segmentDistances[i] >= targetDist) {
      const segFraction = segmentDistances[i] > 0 ? (targetDist - accumulated) / segmentDistances[i] : 0;
      const [lat1, lon1] = points[i];
      const [lat2, lon2] = points[i + 1];
      return {
        lat: lat1 + (lat2 - lat1) * segFraction,
        lon: lon1 + (lon2 - lon1) * segFraction,
        heading: bearing(lat1, lon1, lat2, lon2),
      };
    }
    accumulated += segmentDistances[i];
  }

  const last = points[points.length - 1];
  const prev = points[Math.max(0, points.length - 2)];
  return {
    lat: last[0],
    lon: last[1],
    heading: bearing(prev[0], prev[1], last[0], last[1]),
  };
}

// Build route paths from GTFS data
function buildRoutePaths(data: GTFSData): RoutePath[] {
  const paths: RoutePath[] = [];
  const routeMap = new Map(data.routes.map((r) => [r.route_id, r]));
  const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));

  // Group shapes by shape_id
  const shapeGroups = new Map<string, GTFSShape[]>();
  for (const s of data.shapes) {
    const group = shapeGroups.get(s.shape_id) || [];
    group.push(s);
    shapeGroups.set(s.shape_id, group);
  }

  // Pick one trip per route+direction
  const seenRouteDir = new Set<string>();
  const selectedTrips: { tripId: string; routeId: string; shapeId: string; directionId: string }[] = [];

  for (const trip of data.trips) {
    const key = `${trip.route_id}_${trip.direction_id}`;
    if (seenRouteDir.has(key)) continue;
    seenRouteDir.add(key);
    selectedTrips.push({
      tripId: trip.trip_id,
      routeId: trip.route_id,
      shapeId: trip.shape_id,
      directionId: trip.direction_id,
    });
  }

  // Build stop times lookup
  const tripStopTimes = new Map<string, { stop_id: string; seq: number }[]>();
  for (const st of data.stopTimes) {
    const existing = tripStopTimes.get(st.trip_id) || [];
    existing.push({ stop_id: st.stop_id, seq: st.stop_sequence });
    tripStopTimes.set(st.trip_id, existing);
  }

  for (const sel of selectedTrips) {
    const route = routeMap.get(sel.routeId);
    if (!route) continue;

    let points: [number, number][] = [];

    // Use shapes if available
    const shapePoints = shapeGroups.get(sel.shapeId);
    if (shapePoints && shapePoints.length > 1) {
      points = shapePoints
        .sort((a, b) => a.shape_pt_sequence - b.shape_pt_sequence)
        .map((s) => [s.shape_pt_lat, s.shape_pt_lon] as [number, number]);
    } else {
      // Fallback: connect stops
      const tripStops = tripStopTimes.get(sel.tripId);
      if (!tripStops || tripStops.length < 2) continue;
      tripStops.sort((a, b) => a.seq - b.seq);
      points = tripStops
        .map((ts) => {
          const stop = stopMap.get(ts.stop_id);
          return stop ? [stop.stop_lat, stop.stop_lon] as [number, number] : null;
        })
        .filter(Boolean) as [number, number][];
    }

    if (points.length < 2) continue;

    // Calculate segment distances
    const segmentDistances: number[] = [];
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const d = haversine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
      segmentDistances.push(d);
      totalDistance += d;
    }

    if (totalDistance < 0.1) continue; // Skip tiny routes

    // Map stops to positions along the path
    const tripStops = tripStopTimes.get(sel.tripId) || [];
    tripStops.sort((a, b) => a.seq - b.seq);

    const stopsAlongRoute: RoutePath["stops"] = [];
    for (const ts of tripStops) {
      const stop = stopMap.get(ts.stop_id);
      if (!stop) continue;

      // Find closest point on the path
      let minDist = Infinity;
      let bestAlongDist = 0;
      let accumulated = 0;

      for (let i = 0; i < points.length - 1; i++) {
        const d = haversine(stop.stop_lat, stop.stop_lon, points[i][0], points[i][1]);
        if (d < minDist) {
          minDist = d;
          bestAlongDist = accumulated;
        }
        accumulated += segmentDistances[i];
      }
      // Check last point
      const dLast = haversine(stop.stop_lat, stop.stop_lon, points[points.length - 1][0], points[points.length - 1][1]);
      if (dLast < minDist) {
        bestAlongDist = totalDistance;
      }

      stopsAlongRoute.push({
        stopId: ts.stop_id,
        name: stop.stop_name,
        distanceAlong: bestAlongDist / totalDistance, // normalized 0-1
      });
    }

    // Sort stops by distance along route
    stopsAlongRoute.sort((a, b) => a.distanceAlong - b.distanceAlong);

    paths.push({
      routeId: sel.routeId,
      tripId: sel.tripId,
      directionId: sel.directionId,
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

// Simulate speed variation based on time of day
function getSpeedMultiplier(): number {
  const hour = new Date().getHours();
  // Rush hours: 7-9, 17-19 → slower
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) return 0.6;
  // Night: 22-6 → faster (less traffic)
  if (hour >= 22 || hour <= 6) return 1.3;
  return 1.0;
}

// Average bus speed in km/h for Tirana urban
const BASE_SPEED_KMH = 18;

let cachedPaths: RoutePath[] | null = null;

export function generateSimulatedBuses(data: GTFSData): SimulatedBus[] {
  cachedPaths = buildRoutePaths(data);
  const buses: SimulatedBus[] = [];
  let busIndex = 0;

  for (const path of cachedPaths) {
    // Place 2-4 buses per route path, spread evenly
    const busCount = Math.min(2 + Math.floor(path.totalDistance / 5), 4);

    for (let b = 0; b < busCount; b++) {
      const progress = (b / busCount + Math.random() * 0.05) % 1;
      const pos = interpolateAlongPath(path.points, path.segmentDistances, path.totalDistance, progress);

      // Find next stop
      const nextStop = path.stops.find((s) => s.distanceAlong > progress) || path.stops[path.stops.length - 1];
      const distToNextStop = nextStop
        ? Math.abs(nextStop.distanceAlong - progress) * path.totalDistance
        : 0;
      const etaMinutes = distToNextStop > 0 ? (distToNextStop / (BASE_SPEED_KMH * getSpeedMultiplier())) * 60 : 0;

      buses.push({
        vehicle_id: `TR-${String(busIndex++).padStart(3, "0")}`,
        route_id: path.routeId,
        trip_id: path.tripId,
        latitude: pos.lat,
        longitude: pos.lon,
        heading: pos.heading,
        speed: BASE_SPEED_KMH * getSpeedMultiplier() * (0.8 + Math.random() * 0.4),
        timestamp: Date.now(),
        route_color: path.routeColor,
        route_name: path.routeName,
        progress,
        next_stop_name: nextStop?.name || "",
        next_stop_id: nextStop?.stopId || "",
        eta_minutes: Math.round(etaMinutes),
        status: Math.random() < 0.1 ? "at_stop" : "in_transit",
        passengers: Math.floor(Math.random() * 50) + 5,
        direction_id: path.directionId,
        moving_forward: true,
      });
    }
  }

  return buses;
}

// Move buses along their actual route shapes
export function updateBusPositions(buses: SimulatedBus[], data: GTFSData): SimulatedBus[] {
  if (!cachedPaths) cachedPaths = buildRoutePaths(data);
  const pathMap = new Map<string, RoutePath>();
  for (const p of cachedPaths) {
    pathMap.set(`${p.routeId}_${p.directionId}`, p);
  }

  const speedMult = getSpeedMultiplier();
  const updateIntervalSec = 10; // matches the 10s interval in GTFSContext

  return buses.map((bus) => {
    const path = pathMap.get(`${bus.route_id}_${bus.direction_id}`);
    if (!path || path.totalDistance < 0.1) return { ...bus, timestamp: Date.now() };

    // Calculate how far the bus moves in 10 seconds
    const currentSpeed = BASE_SPEED_KMH * speedMult * (0.8 + Math.random() * 0.4);
    const distanceKm = (currentSpeed * updateIntervalSec) / 3600;
    const progressDelta = distanceKm / path.totalDistance;
    let newProgress = bus.progress + progressDelta;

    // At stop behavior: pause briefly
    const wasAtStop = bus.status === "at_stop";
    let newStatus: SimulatedBus["status"] = "in_transit";

    // When bus reaches the end, pause at terminus then loop back to start
    // On round-trip routes the last point ≈ first point, so 1.0 → 0.0 is seamless
    if (newProgress >= 0.995) {
      if (!wasAtStop) {
        // First arrival at terminus — hold here
        newProgress = 1.0;
        newStatus = "at_stop";
      } else {
        // Was already paused — restart from beginning
        newProgress = 0.0;
        newStatus = "in_transit";
      }
    } else {
      const nearStop = path.stops.find(
        (s) => Math.abs(s.distanceAlong - newProgress) < 0.005
      );
      if (nearStop && !wasAtStop && Math.random() < 0.4) {
        newStatus = "at_stop";
        newProgress = bus.progress;
      }
    }

    const pos = interpolateAlongPath(path.points, path.segmentDistances, path.totalDistance, newProgress);

    // Find next stop
    const nextStop = path.stops.find((s) => s.distanceAlong > newProgress) || path.stops[0];
    const distToNextStop = nextStop
      ? Math.abs(nextStop.distanceAlong - newProgress) * path.totalDistance
      : 0;
    const etaMinutes = distToNextStop > 0 ? (distToNextStop / (currentSpeed)) * 60 : 0;

    // Slight passenger variation
    const passengerDelta = newStatus === "at_stop" ? Math.floor(Math.random() * 8 - 3) : 0;

    return {
      ...bus,
      latitude: pos.lat,
      longitude: pos.lon,
      heading: pos.heading,
      speed: newStatus === "at_stop" ? 0 : currentSpeed,
      timestamp: Date.now(),
      progress: newProgress,
      next_stop_name: nextStop?.name || bus.next_stop_name,
      next_stop_id: nextStop?.stopId || bus.next_stop_id,
      eta_minutes: Math.round(etaMinutes),
      status: newStatus,
      passengers: Math.max(0, Math.min(60, bus.passengers + passengerDelta)),
      moving_forward: true,
    };
  });
}
