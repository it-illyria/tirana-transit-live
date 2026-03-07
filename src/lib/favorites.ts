const FAVS_KEY = "tirana_bus_favorites";

export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(stopId: string): string[] {
  const favs = getFavorites();
  const idx = favs.indexOf(stopId);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(stopId);
  }
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  return favs;
}

export function isFavorite(stopId: string): boolean {
  return getFavorites().includes(stopId);
}
