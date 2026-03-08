import type { GTFSData, GTFSStop, TripPlan, TripPlanStep } from "./gtfs-types";

// Simple connection scan: find routes between two stops
export function findTrips(
  data: GTFSData,
  fromStop: GTFSStop,
  toStop: GTFSStop
): TripPlan[] {
  const plans: TripPlan[] = [];

  // Build index: stop_id -> list of (trip_id, stop_sequence, departure_time)
  const stopToTrips = new Map<string, { trip_id: string; seq: number; dep: string; arr: string }[]>();
  for (const st of data.stopTimes) {
    const list = stopToTrips.get(st.stop_id) || [];
    list.push({ trip_id: st.trip_id, seq: st.stop_sequence, dep: st.departure_time, arr: st.arrival_time });
    stopToTrips.set(st.stop_id, list);
  }

  const tripMap = new Map(data.trips.map((t) => [t.trip_id, t]));
  const routeMap = new Map(data.routes.map((r) => [r.route_id, r]));
  const stopMap = new Map(data.stops.map((s) => [s.stop_id, s]));

  // Direct routes: find trips that visit both stops in order
  const fromTrips = stopToTrips.get(fromStop.stop_id) || [];

  for (const ft of fromTrips) {
    const toEntries = (stopToTrips.get(toStop.stop_id) || [])
      .filter((tt) => tt.trip_id === ft.trip_id && tt.seq > ft.seq);

    for (const tt of toEntries) {
      const trip = tripMap.get(ft.trip_id);
      if (!trip) continue;
      const route = routeMap.get(trip.route_id);
      if (!route) continue;

      const depMinutes = timeToMinutes(ft.dep);
      const arrMinutes = timeToMinutes(tt.arr);
      if (depMinutes < 0 || arrMinutes < 0) continue;

      plans.push({
        steps: [
          { type: "board", route, stop: fromStop, time: ft.dep, tripId: ft.trip_id },
          { type: "alight", route, stop: toStop, time: tt.arr },
        ],
        duration: arrMinutes - depMinutes,
        transfers: 0,
        departureTime: ft.dep,
        arrivalTime: tt.arr,
      });
    }
  }

  // 1-transfer routes
  if (plans.length < 3) {
    // Find intermediate stops reachable from fromStop
    for (const ft of fromTrips.slice(0, 5)) {
      const trip1 = tripMap.get(ft.trip_id);
      if (!trip1) continue;

      // Get all stops after fromStop on this trip
      const trip1Stops = data.stopTimes
        .filter((st) => st.trip_id === ft.trip_id && st.stop_sequence > ft.seq)
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .slice(0, 10);

      for (const midSt of trip1Stops) {
        const midTrips = stopToTrips.get(midSt.stop_id) || [];
        for (const mt of midTrips.slice(0, 3)) {
          if (mt.trip_id === ft.trip_id) continue;
          const midArr = timeToMinutes(midSt.arrival_time);
          const midDep = timeToMinutes(mt.dep);
          if (midDep < midArr + 2) continue; // Need 2 min transfer

          const toOnTrip2 = (stopToTrips.get(toStop.stop_id) || [])
            .find((tt) => tt.trip_id === mt.trip_id && tt.seq > mt.seq);

          if (!toOnTrip2) continue;

          const trip2 = tripMap.get(mt.trip_id);
          if (!trip2) continue;
          const route1 = routeMap.get(trip1.route_id);
          const route2 = routeMap.get(trip2.route_id);
          if (!route1 || !route2) continue;

          const midStop = stopMap.get(midSt.stop_id);
          if (!midStop) continue;

          const depMinutes = timeToMinutes(ft.dep);
          const arrMinutes = timeToMinutes(toOnTrip2.arr);

          plans.push({
            steps: [
              { type: "board", route: route1, stop: fromStop, time: ft.dep, tripId: ft.trip_id },
              { type: "alight", route: route1, stop: midStop, time: midSt.arrival_time },
              { type: "transfer", stop: midStop, time: mt.dep },
              { type: "board", route: route2, stop: midStop, time: mt.dep, tripId: mt.trip_id },
              { type: "alight", route: route2, stop: toStop, time: toOnTrip2.arr },
            ],
            duration: arrMinutes - depMinutes,
            transfers: 1,
            departureTime: ft.dep,
            arrivalTime: toOnTrip2.arr,
          });

          if (plans.length >= 5) break;
        }
        if (plans.length >= 5) break;
      }
      if (plans.length >= 5) break;
    }
  }

  // Sort by duration, deduplicate, limit
  plans.sort((a, b) => a.duration - b.duration);
  return plans.slice(0, 5);
}

function timeToMinutes(time: string): number {
  const parts = time.split(":");
  if (parts.length < 2) return -1;
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Get upcoming departures from a stop
export function getUpcomingDepartures(
  data: GTFSData,
  stopId: string,
  limit = 5
): { route: string; routeId: string; routeColor: string; time: string; headsign: string; minutesAway: number }[] {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const tripMap = new Map(data.trips.map((t) => [t.trip_id, t]));
  const routeMap = new Map(data.routes.map((r) => [r.route_id, r]));

  const departures = data.stopTimes
    .filter((st) => st.stop_id === stopId)
    .map((st) => {
      const depMinutes = timeToMinutes(st.departure_time);
      const trip = tripMap.get(st.trip_id);
      const route = trip ? routeMap.get(trip.route_id) : null;
      return {
        route: route?.route_short_name || route?.route_long_name || "?",
        routeId: trip?.route_id || "",
        routeColor: route?.route_color || "#0066CC",
        time: st.departure_time,
        headsign: trip?.trip_headsign || "",
        minutesAway: depMinutes - currentMinutes,
      };
    })
    .filter((d) => d.minutesAway > 0 && d.minutesAway < 120)
    .sort((a, b) => a.minutesAway - b.minutesAway)
    .slice(0, limit);

  return departures;
}
