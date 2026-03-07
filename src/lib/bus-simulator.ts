import type { GTFSData, SimulatedBus } from "./gtfs-types";

// Generate simulated bus positions along routes
export function generateSimulatedBuses(data: GTFSData): SimulatedBus[] {
  const buses: SimulatedBus[] = [];
  if (!data.routes.length || !data.trips.length || !data.stopTimes.length) return buses;

  // For each route, pick 1-2 trips and simulate buses
  const routeTrips = new Map<string, string[]>();
  for (const trip of data.trips) {
    const existing = routeTrips.get(trip.route_id) || [];
    if (existing.length < 2) {
      existing.push(trip.trip_id);
      routeTrips.set(trip.route_id, existing);
    }
  }

  // Build stop lookup
  const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));

  // Get stop sequences for trips
  const tripStops = new Map<string, { stop_id: string; seq: number }[]>();
  for (const st of data.stopTimes) {
    const existing = tripStops.get(st.trip_id) || [];
    existing.push({ stop_id: st.stop_id, seq: st.stop_sequence });
    tripStops.set(st.trip_id, existing);
  }

  const routeMap = new Map(data.routes.map((r) => [r.route_id, r]));

  let busIndex = 0;
  for (const [routeId, tripIds] of routeTrips) {
    const route = routeMap.get(routeId);
    if (!route) continue;

    for (const tripId of tripIds) {
      const stops = tripStops.get(tripId);
      if (!stops || stops.length < 2) continue;

      stops.sort((a, b) => a.seq - b.seq);

      // Place bus at a random position along the route
      const progress = Math.random();
      const stopIndex = Math.floor(progress * (stops.length - 1));
      const fraction = (progress * (stops.length - 1)) - stopIndex;

      const stopA = stopMap.get(stops[stopIndex].stop_id);
      const stopB = stopMap.get(stops[Math.min(stopIndex + 1, stops.length - 1)].stop_id);

      if (!stopA || !stopB) continue;

      const lat = stopA.stop_lat + (stopB.stop_lat - stopA.stop_lat) * fraction;
      const lon = stopA.stop_lon + (stopB.stop_lon - stopA.stop_lon) * fraction;

      // Calculate heading
      const dLat = stopB.stop_lat - stopA.stop_lat;
      const dLon = stopB.stop_lon - stopA.stop_lon;
      const heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;

      buses.push({
        vehicle_id: `BUS-${String(busIndex++).padStart(3, "0")}`,
        route_id: routeId,
        trip_id: tripId,
        latitude: lat,
        longitude: lon,
        heading: (heading + 360) % 360,
        speed: 15 + Math.random() * 25,
        timestamp: Date.now(),
        route_color: route.route_color,
        route_name: route.route_short_name || route.route_long_name,
      });
    }
  }

  return buses;
}

// Move buses along their routes slightly
export function updateBusPositions(
  buses: SimulatedBus[],
  data: GTFSData
): SimulatedBus[] {
  const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));
  const tripStops = new Map<string, { stop_id: string; seq: number }[]>();
  for (const st of data.stopTimes) {
    const existing = tripStops.get(st.trip_id) || [];
    existing.push({ stop_id: st.stop_id, seq: st.stop_sequence });
    tripStops.set(st.trip_id, existing);
  }

  return buses.map((bus) => {
    const stops = tripStops.get(bus.trip_id);
    if (!stops || stops.length < 2) return { ...bus, timestamp: Date.now() };

    // Move slightly in heading direction
    const rad = (bus.heading * Math.PI) / 180;
    const speed = 0.0001 + Math.random() * 0.0002; // Small movement
    const newLat = bus.latitude + Math.cos(rad) * speed;
    const newLon = bus.longitude + Math.sin(rad) * speed;

    // Keep within Tirana bounds
    const lat = Math.max(41.28, Math.min(41.38, newLat));
    const lon = Math.max(19.75, Math.min(19.90, newLon));

    return {
      ...bus,
      latitude: lat,
      longitude: lon,
      heading: (bus.heading + (Math.random() - 0.5) * 10 + 360) % 360,
      speed: 10 + Math.random() * 30,
      timestamp: Date.now(),
    };
  });
}
