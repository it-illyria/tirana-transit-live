import { useEffect, useRef, useCallback } from "react";
import { useGTFS } from "@/contexts/GTFSContext";
import { getFavorites } from "@/lib/favorites";
import { predictArrivals } from "@/lib/arrival-predictions";

const ALERT_THRESHOLD_MIN = 2;
const CHECK_INTERVAL_MS = 15_000; // check every 15s
const COOLDOWN_MS = 5 * 60_000; // don't re-alert same bus+stop for 5 min

/**
 * Monitors favorited stops and sends browser push notifications
 * when a bus is predicted to arrive within 2 minutes.
 */
export function useFavoriteAlerts() {
  const { data, buses } = useGTFS();
  const notifiedRef = useRef<Map<string, number>>(new Map());
  const permissionRef = useRef<NotificationPermission>("default");

  // Request notification permission on mount
  useEffect(() => {
    if (!("Notification" in window)) return;
    permissionRef.current = Notification.permission;
    if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        permissionRef.current = perm;
      });
    }
  }, []);

  const checkArrivals = useCallback(() => {
    if (!data || buses.length === 0) return;
    if (permissionRef.current !== "granted") return;

    const favs = getFavorites();
    if (favs.length === 0) return;

    const now = Date.now();

    // Purge old cooldowns
    for (const [key, ts] of notifiedRef.current) {
      if (now - ts > COOLDOWN_MS) notifiedRef.current.delete(key);
    }

    for (const stopId of favs) {
      const predictions = predictArrivals(data, buses, stopId, 4);
      const stop = data.stops.find((s) => s.stop_id === stopId);
      const stopName = stop?.stop_name ?? stopId;

      for (const pred of predictions) {
        if (pred.predictedMinutes > ALERT_THRESHOLD_MIN) continue;

        const key = `${stopId}__${pred.vehicleId}`;
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.set(key, now);

        const mins = pred.predictedMinutes <= 0 ? "now" : `${pred.predictedMinutes} min`;
        new Notification(`🚌 Bus ${pred.routeName} arriving ${mins}`, {
          body: `At ${stopName} — ${pred.stopsAway} stop${pred.stopsAway !== 1 ? "s" : ""} away`,
          icon: "/favicon.ico",
          tag: key,
        });
      }
    }
  }, [data, buses]);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(checkArrivals, CHECK_INTERVAL_MS);
    // Run immediately once
    checkArrivals();
    return () => clearInterval(id);
  }, [checkArrivals, data]);
}
