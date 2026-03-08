import { useState, useEffect, useMemo } from "react";
import { Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { useGTFS } from "@/contexts/GTFSContext";

const WALK_SPEED_KMH = 5;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const userIcon = new L.DivIcon({
  className: "user-location-marker",
  html: `<div style="
    width:16px;height:16px;
    background:hsl(211 100% 50%);
    border:3px solid white;
    border-radius:50%;
    box-shadow:0 0 0 3px hsl(211 100% 50% / 0.3), 0 2px 6px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const WalkToStop = () => {
  const { data } = useGTFS();
  const map = useMap();
  const [userPos, setUserPos] = useState<[number, number] | null>(null);

  useEffect(() => {
    const onLocationFound = (e: L.LocationEvent) => {
      setUserPos([e.latlng.lat, e.latlng.lng]);
    };
    map.on("locationfound", onLocationFound);

    // Also try to get location proactively
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
        () => {},
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }

    return () => {
      map.off("locationfound", onLocationFound);
    };
  }, [map]);

  const nearestStop = useMemo(() => {
    if (!userPos || !data) return null;

    let best: { stop: typeof data.stops[0]; dist: number } | null = null;
    for (const stop of data.stops) {
      const d = haversine(userPos[0], userPos[1], stop.stop_lat, stop.stop_lon);
      if (!best || d < best.dist) {
        best = { stop, dist: d };
      }
    }
    return best;
  }, [userPos, data]);

  if (!userPos || !nearestStop || nearestStop.dist > 3) return null; // Hide if > 3km

  const walkMinutes = Math.round((nearestStop.dist / WALK_SPEED_KMH) * 60);
  const distMeters = Math.round(nearestStop.dist * 1000);

  return (
    <>
      {/* User position marker */}
      <Marker position={userPos} icon={userIcon}>
        <Tooltip direction="top" offset={[0, -12]} permanent={false}>
          <span style={{ fontSize: 11, fontWeight: 600 }}>📍 You are here</span>
        </Tooltip>
      </Marker>

      {/* Dashed walking line */}
      <Polyline
        positions={[userPos, [nearestStop.stop.stop_lat, nearestStop.stop.stop_lon]]}
        pathOptions={{
          color: "hsl(211, 100%, 40%)",
          weight: 3,
          opacity: 0.7,
          dashArray: "8, 8",
          lineCap: "round",
        }}
      />

      {/* Walk info at midpoint */}
      <Marker
        position={[
          (userPos[0] + nearestStop.stop.stop_lat) / 2,
          (userPos[1] + nearestStop.stop.stop_lon) / 2,
        ]}
        icon={new L.DivIcon({
          className: "walk-info-marker",
          html: `<div style="
            background: white;
            border-radius: 8px;
            padding: 3px 8px;
            font-size: 11px;
            font-weight: 600;
            color: hsl(211, 100%, 35%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 4px;
          ">🚶 ${walkMinutes} min · ${distMeters}m</div>`,
          iconSize: [0, 0],
          iconAnchor: [50, 10],
        })}
      >
        <Tooltip direction="bottom" offset={[0, 8]} permanent={false}>
          <span style={{ fontSize: 11 }}>
            Walk to <strong>{nearestStop.stop.stop_name}</strong>
          </span>
        </Tooltip>
      </Marker>
    </>
  );
};

export default WalkToStop;
