import { useEffect, useRef, useCallback } from "react";
import { useGTFS } from "@/contexts/GTFSContext";
import { getFavorites } from "@/lib/favorites";
import { predictArrivals } from "@/lib/arrival-predictions";
import { getNotificationSettings } from "@/lib/notification-settings";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 15_000;
const COOLDOWN_MS = 5 * 60_000;

export function useFavoriteAlerts() {
  const { data, buses } = useGTFS();
  const notifiedRef = useRef<Map<string, number>>(new Map());
  const permissionRef = useRef<NotificationPermission>("default");

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
    const settings = getNotificationSettings();
    if (!settings.enabled) return;
    if (!data || buses.length === 0) return;

    const favs = getFavorites();
    if (favs.length === 0) return;

    const now = Date.now();
    for (const [key, ts] of notifiedRef.current) {
      if (now - ts > COOLDOWN_MS) notifiedRef.current.delete(key);
    }

    for (const stopId of favs) {
      const predictions = predictArrivals(data, buses, stopId, 4);
      const stop = data.stops.find((s) => s.stop_id === stopId);
      const stopName = stop?.stop_name ?? stopId;

      for (const pred of predictions) {
        if (pred.predictedMinutes > settings.thresholdMinutes) continue;

        const key = `${stopId}__${pred.vehicleId}`;
        if (notifiedRef.current.has(key)) continue;
        notifiedRef.current.set(key, now);

        const mins = pred.predictedMinutes <= 0 ? "now" : `in ${pred.predictedMinutes} min`;
        const title = `🚌 Bus ${pred.routeName} arriving ${mins}`;
        const body = `At ${stopName} — ${pred.stopsAway} stop${pred.stopsAway !== 1 ? "s" : ""} away`;

        // In-app toast notification (always shown when app is focused)
        toast(title, {
          description: body,
          duration: 8000,
          icon: "🚌",
        });

        // Browser push notification (shown when tab is in background)
        if (permissionRef.current === "granted" && document.hidden) {
          try {
            new Notification(title, {
              body,
              icon: "/pwa-icon-192.png",
              tag: key,
              badge: "/pwa-icon-192.png",
              vibrate: [200, 100, 200],
            });
          } catch {
            // Notification API may not be available in all contexts
          }
        }
      }
    }
  }, [data, buses]);

  useEffect(() => {
    if (!data) return;
    const id = setInterval(checkArrivals, CHECK_INTERVAL_MS);
    checkArrivals();
    return () => clearInterval(id);
  }, [checkArrivals, data]);
}
