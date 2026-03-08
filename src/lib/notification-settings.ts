const SETTINGS_KEY = "tirana_bus_notif_settings";

export interface NotificationSettings {
  enabled: boolean;
  thresholdMinutes: number; // alert when bus is within X minutes
}

const DEFAULTS: NotificationSettings = {
  enabled: true,
  thresholdMinutes: 2,
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotificationSettings(s: NotificationSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
