import type { GTFSData, SimulatedBus } from "./gtfs-types";

/**
 * Traffic congestion model for Tirana.
 * Simulates congestion zones and time-based traffic patterns.
 */

interface CongestionZone {
  name: string;
  lat: number;
  lon: number;
  radius: number; // km
  baseFactor: number; // 1.0 = no delay, 2.0 = double travel time
}

// Known congestion hotspots in Tirana
const CONGESTION_ZONES: CongestionZone[] = [
  { name: "Skanderbeg Square", lat: 41.3275, lon: 19.8187, radius: 0.5, baseFactor: 1.4 },
  { name: "Blloku Area", lat: 41.3190, lon: 19.8200, radius: 0.4, baseFactor: 1.3 },
  { name: "21 Dhjetori Roundabout", lat: 41.3320, lon: 19.8220, radius: 0.3, baseFactor: 1.5 },
  { name: "Zogu I Blvd", lat: 41.3350, lon: 19.8150, radius: 0.6, baseFactor: 1.35 },
  { name: "Rruga e Durrësit", lat: 41.3380, lon: 19.8050, radius: 0.5, baseFactor: 1.4 },
  { name: "Komuna e Parisit", lat: 41.3230, lon: 19.8270, radius: 0.3, baseFactor: 1.25 },
  { name: "Qëndra / Train Station", lat: 41.3310, lon: 19.8100, radius: 0.4, baseFactor: 1.3 },
];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Get time-of-day traffic multiplier
 */
function getTimeMultiplier(): number {
  const hour = new Date().getHours();
  // Morning rush: 7-9
  if (hour >= 7 && hour <= 9) return 1.6;
  // Evening rush: 17-19
  if (hour >= 17 && hour <= 19) return 1.7;
  // Midday: moderate
  if (hour >= 10 && hour <= 16) return 1.2;
  // Night: clear
  if (hour >= 22 || hour <= 5) return 0.9;
  return 1.1;
}

/**
 * Calculate congestion factor at a given location
 * Returns a multiplier >= 1.0 (higher = more delay)
 */
export function getCongestionFactor(lat: number, lon: number): number {
  const timeMult = getTimeMultiplier();
  let maxCongestion = 1.0;

  for (const zone of CONGESTION_ZONES) {
    const dist = haversine(lat, lon, zone.lat, zone.lon);
    if (dist < zone.radius) {
      // Stronger effect closer to center
      const proximity = 1 - dist / zone.radius;
      const factor = 1 + (zone.baseFactor - 1) * proximity * timeMult;
      maxCongestion = Math.max(maxCongestion, factor);
    }
  }

  // Add random micro-variation (±5%)
  return maxCongestion * (0.95 + Math.random() * 0.1);
}

/**
 * Get congestion level label
 */
export function getCongestionLevel(factor: number): "low" | "moderate" | "heavy" | "severe" {
  if (factor < 1.15) return "low";
  if (factor < 1.4) return "moderate";
  if (factor < 1.7) return "heavy";
  return "severe";
}

export interface ArrivalPrediction {
  routeName: string;
  routeColor: string;
  routeId: string;
  vehicleId: string;
  scheduledMinutes: number; // scheduled arrival time from GTFS
  predictedMinutes: number; // predicted with congestion
  delayMinutes: number;     // difference (positive = late)
  congestionLevel: "low" | "moderate" | "heavy" | "severe";
  congestionFactor: number;
  status: "on_time" | "slightly_delayed" | "delayed" | "heavily_delayed";
  busStatus: "in_transit" | "at_stop" | "delayed";
  stopsAway: number;
}

/**
 * Predict when each active bus will arrive at a given stop.
 * Combines schedule data with real-time simulated positions and traffic congestion.
 */
export function predictArrivals(
  data: GTFSData,
  buses: SimulatedBus[],
  stopId: string,
  limit = 6
): ArrivalPrediction[] {
  const stop = data.stops.find((s) => s.stop_id === stopId);
  if (!stop) return [];

  const tripMap = new Map(data.trips.map((t) => [t.trip_id, t]));
  const routeMap = new Map(data.routes.map((r) => [r.route_id, r]));

  // Build: which trips serve this stop and at what sequence?
  const stopTrips = new Map<string, { seq: number; arrivalTime: string }>();
  for (const st of data.stopTimes) {
    if (st.stop_id === stopId) {
      stopTrips.set(st.trip_id, { seq: st.stop_sequence, arrivalTime: st.arrival_time });
    }
  }

  // For each bus, check if its trip serves this stop
  const predictions: ArrivalPrediction[] = [];

  for (const bus of buses) {
    // Find if this bus's route serves this stop
    const trip = tripMap.get(bus.trip_id);
    if (!trip) continue;
    const route = routeMap.get(trip.route_id);
    if (!route) continue;

    // Check if the stop is on a trip for this route
    // Find any trip on this route that serves the stop
    const routeTrips = data.trips.filter((t) => t.route_id === bus.route_id);
    let bestStopInfo: { seq: number; arrivalTime: string } | null = null;

    for (const rt of routeTrips) {
      const info = stopTrips.get(rt.trip_id);
      if (info) {
        bestStopInfo = info;
        break;
      }
    }

    if (!bestStopInfo) continue;

    // Calculate distance from bus to this stop
    const distKm = haversine(bus.latitude, bus.longitude, stop.stop_lat, stop.stop_lon);

    // Skip if bus is too far (> 15km)
    if (distKm > 15) continue;

    // Get congestion along the path (sample midpoint)
    const midLat = (bus.latitude + stop.stop_lat) / 2;
    const midLon = (bus.longitude + stop.stop_lon) / 2;
    const congestionAtBus = getCongestionFactor(bus.latitude, bus.longitude);
    const congestionAtMid = getCongestionFactor(midLat, midLon);
    const congestionAtStop = getCongestionFactor(stop.stop_lat, stop.stop_lon);
    const avgCongestion = (congestionAtBus + congestionAtMid + congestionAtStop) / 3;

    // Base speed (km/h) adjusted for congestion
    const baseSpeed = 18; // Tirana urban average
    const effectiveSpeed = baseSpeed / avgCongestion;

    // Predicted travel time in minutes
    const travelMinutes = (distKm / effectiveSpeed) * 60;

    // Scheduled time
    const scheduledMinutes = timeToMinutes(bestStopInfo.arrivalTime);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // How many stops away?
    // Count stops between bus's current position and target stop on the same route
    const tripStopTimes = data.stopTimes
      .filter((st) => st.trip_id === bus.trip_id)
      .sort((a, b) => a.stop_sequence - b.stop_sequence);

    const targetSeq = bestStopInfo.seq;
    const busStopIdx = Math.floor(bus.progress * tripStopTimes.length);
    const stopsAway = Math.max(0, targetSeq - busStopIdx);

    // Add dwell time at intermediate stops (~30s each)
    const dwellMinutes = stopsAway * 0.5;
    const predictedMinutes = Math.round(travelMinutes + dwellMinutes);

    // Calculate delay vs schedule
    const scheduledArrivalFromNow = scheduledMinutes > currentMinutes
      ? scheduledMinutes - currentMinutes
      : scheduledMinutes + 1440 - currentMinutes; // next day
    const delayMinutes = predictedMinutes - Math.min(scheduledArrivalFromNow, predictedMinutes);

    // Determine status
    let status: ArrivalPrediction["status"];
    if (delayMinutes <= 1) status = "on_time";
    else if (delayMinutes <= 3) status = "slightly_delayed";
    else if (delayMinutes <= 8) status = "delayed";
    else status = "heavily_delayed";

    predictions.push({
      routeName: route.route_short_name || route.route_long_name,
      routeColor: route.route_color,
      routeId: route.route_id,
      vehicleId: bus.vehicle_id,
      scheduledMinutes: Math.round(scheduledArrivalFromNow),
      predictedMinutes,
      delayMinutes: Math.max(0, delayMinutes),
      congestionLevel: getCongestionLevel(avgCongestion),
      congestionFactor: avgCongestion,
      status,
      busStatus: bus.status,
      stopsAway,
    });
  }

  // Sort by predicted arrival time, deduplicate by route
  predictions.sort((a, b) => a.predictedMinutes - b.predictedMinutes);

  // Keep only nearest bus per route
  const seenRoutes = new Set<string>();
  const unique: ArrivalPrediction[] = [];
  for (const p of predictions) {
    if (!seenRoutes.has(p.routeId)) {
      seenRoutes.add(p.routeId);
      unique.push(p);
    }
  }

  return unique.slice(0, limit);
}

function timeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length < 2) return -1;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}
