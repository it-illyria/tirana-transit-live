export interface GTFSRoute {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_type: string;
}

export interface GTFSStop {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
}

export interface GTFSTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_headsign: string;
  direction_id: string;
  shape_id: string;
}

export interface GTFSStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

export interface GTFSShape {
  shape_id: string;
  shape_pt_lat: number;
  shape_pt_lon: number;
  shape_pt_sequence: number;
}

export interface SimulatedBus {
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
  // Enhanced simulator fields
  progress: number; // 0-1 along the route path
  next_stop_name: string;
  next_stop_id: string;
  eta_minutes: number;
  status: "in_transit" | "at_stop" | "delayed";
  passengers: number;
  direction_id: string;
  moving_forward?: boolean;
}

export interface GTFSData {
  routes: GTFSRoute[];
  stops: GTFSStop[];
  trips: GTFSTrip[];
  stopTimes: GTFSStopTime[];
  shapes: GTFSShape[];
}

export interface TripPlanStep {
  type: "board" | "alight" | "transfer" | "walk";
  route?: GTFSRoute;
  stop: GTFSStop;
  time: string;
  tripId?: string;
}

export interface TripPlan {
  steps: TripPlanStep[];
  duration: number;
  transfers: number;
  departureTime: string;
  arrivalTime: string;
}
