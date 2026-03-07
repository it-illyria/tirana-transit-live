import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useState } from "react";
import { Locate, Maximize, Minimize } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// Fix default marker icon
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const TIRANA_CENTER: [number, number] = [41.3275, 19.8187];

const MOCK_STOPS = [
  { id: 1, name: "Sheshi Skënderbej", lat: 41.3275, lng: 19.8187 },
  { id: 2, name: "Blloku", lat: 41.3205, lng: 19.8205 },
  { id: 3, name: "Stacioni i Trenit", lat: 41.3305, lng: 19.8165 },
  { id: 4, name: "21 Dhjetori", lat: 41.3245, lng: 19.8255 },
  { id: 5, name: "Kinostudio", lat: 41.3385, lng: 19.8065 },
];

function LocateButton() {
  const map = useMap();
  const { t } = useI18n();

  const handleLocate = () => {
    map.locate({ setView: true, maxZoom: 16 });
  };

  return (
    <button
      onClick={handleLocate}
      className="absolute bottom-28 right-3 z-[1000] w-10 h-10 rounded-xl glass-surface shadow-float flex items-center justify-center hover:bg-accent transition-colors"
      aria-label={t.myLocation}
    >
      <Locate className="w-5 h-5 text-primary" />
    </button>
  );
}

function FullscreenButton() {
  const [isFs, setIsFs] = useState(false);

  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFs(true);
    } else {
      document.exitFullscreen();
      setIsFs(false);
    }
  };

  return (
    <button
      onClick={toggle}
      className="absolute bottom-40 right-3 z-[1000] w-10 h-10 rounded-xl glass-surface shadow-float flex items-center justify-center hover:bg-accent transition-colors"
      aria-label="Fullscreen"
    >
      {isFs ? (
        <Minimize className="w-5 h-5 text-foreground" />
      ) : (
        <Maximize className="w-5 h-5 text-foreground" />
      )}
    </button>
  );
}

const MapView = () => {
  return (
    <div className="fixed inset-0">
      <MapContainer
        center={TIRANA_CENTER}
        zoom={13}
        zoomControl={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {MOCK_STOPS.map((stop) => (
          <Marker key={stop.id} position={[stop.lat, stop.lng]}>
            <Popup>
              <span className="font-semibold">{stop.name}</span>
            </Popup>
          </Marker>
        ))}

        <LocateButton />
        <FullscreenButton />
      </MapContainer>
    </div>
  );
};

export default MapView;
