import { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { getNotificationSettings, saveNotificationSettings, type NotificationSettings } from "@/lib/notification-settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THRESHOLD_OPTIONS = [1, 2, 3, 5, 10];

const NotificationSettingsPanel = ({ open, onClose }: Props) => {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings);
  const [permStatus, setPermStatus] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      setPermStatus(Notification.permission);
    }
  }, [open]);

  const update = (patch: Partial<NotificationSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveNotificationSettings(next);
  };

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    setPermStatus(perm);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="relative z-10 w-full max-w-sm mx-3 mb-3 sm:mb-0 bg-card rounded-2xl shadow-lg border border-border overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Notification Settings</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Enable / disable */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Arrival alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Notify when a bus nears a favorited stop
              </p>
            </div>
            <button
              onClick={() => update({ enabled: !settings.enabled })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.enabled ? "bg-primary" : "bg-muted"
              }`}
              aria-label="Toggle alerts"
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-primary-foreground shadow transition-transform ${
                  settings.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Threshold */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Alert threshold</p>
            <div className="flex gap-2 flex-wrap">
              {THRESHOLD_OPTIONS.map((min) => (
                <button
                  key={min}
                  onClick={() => update({ thresholdMinutes: min })}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    settings.thresholdMinutes === min
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-accent"
                  }`}
                >
                  {min} min
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Get notified when a bus is within {settings.thresholdMinutes} minute{settings.thresholdMinutes !== 1 ? "s" : ""} of your stop
            </p>
          </div>

          {/* Browser permission status */}
          {permStatus !== "granted" && (
            <div className="bg-accent/50 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2.5">
                <BellOff className="w-4 h-4 text-accent-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-accent-foreground">
                    {permStatus === "denied"
                      ? "Notifications blocked"
                      : "Permission required"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {permStatus === "denied"
                      ? "Please enable notifications in your browser settings."
                      : "Allow browser notifications to receive alerts."}
                  </p>
                  {permStatus === "default" && (
                    <button
                      onClick={requestPermission}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      Allow notifications
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsPanel;
