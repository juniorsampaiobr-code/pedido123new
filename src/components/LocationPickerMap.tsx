import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Corrige um problema comum com o ícone do marcador em bundlers como o Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface LocationPickerMapProps {
  center: [number, number];
  markerPosition: [number, number];
  onLocationChange: (lat: number, lng: number) => void;
  // Adicionando uma prop para controlar se o mapa é interativo (para o checkout)
  isInteractive?: boolean; 
}

// Componente para atualizar a visão do mapa quando a posição do marcador muda
const RecenterAutomatically = ({ lat, lng }: { lat: number, lng: number }) => {
  const map = useMap();
  useEffect(() => {
    // Adicionando verificação para garantir que as coordenadas são números finitos e válidos
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], map.getZoom() || 15, { animate: true });
    }
  }, [lat, lng, map]);
  return null;
};

// Componente para lidar com cliques no mapa (opcionalmente)
const MapClickHandler = ({ onLocationChange, isInteractive }: { onLocationChange: (lat: number, lng: number) => void, isInteractive: boolean }) => {
  useMapEvents({
    click(e) {
      if (isInteractive) {
        onLocationChange(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

const LocationPickerMap = ({ center, markerPosition, onLocationChange, isInteractive = true }: LocationPickerMapProps) => {
  
  // Verifica se as coordenadas são válidas antes de renderizar o MapContainer
  const isCenterValid = Number.isFinite(center[0]) && Number.isFinite(center[1]);
  const isMarkerValid = Number.isFinite(markerPosition[0]) && Number.isFinite(markerPosition[1]);

  if (!isCenterValid || !isMarkerValid) {
    // Retorna um placeholder se as coordenadas forem inválidas
    return (
      <div className="h-96 w-full rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
        Coordenadas inválidas para o mapa.
      </div>
    );
  }

  return (
    <MapContainer 
      center={center} 
      zoom={15} 
      scrollWheelZoom={isInteractive} 
      dragging={isInteractive}
      doubleClickZoom={isInteractive}
      className="h-96 w-full rounded-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={markerPosition}
        draggable={isInteractive} // Apenas arrastável se for interativo
        eventHandlers={isInteractive ? {
          dragend: (e) => {
            const { lat, lng } = e.target.getLatLng();
            onLocationChange(lat, lng);
          },
        } : undefined}
      />
      <RecenterAutomatically lat={markerPosition[0]} lng={markerPosition[1]} />
      <MapClickHandler onLocationChange={onLocationChange} isInteractive={isInteractive} />
    </MapContainer>
  );
};

export default LocationPickerMap;