import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';

// Define o tipo das props esperadas
interface MapComponentProps {
  center: [number, number];
  markerPosition: [number, number];
  onMarkerDragEnd: (lat: number, lng: number) => void;
  zoom: number;
  className?: string;
}

// Fixa o ícone padrão do Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Componente interno para lidar com eventos do mapa e arrastar o marcador
const DraggableMarker = ({ position, onDragEnd }: { position: [number, number], onDragEnd: (lat: number, lng: number) => void }) => {
  const markerRef = useRef<L.Marker>(null);
  const map = useMapEvents({
    // Move o mapa para o centro do marcador se ele for arrastado para fora da tela
    moveend: () => {
      if (markerRef.current) {
        const markerLatLng = markerRef.current.getLatLng();
        if (!map.getBounds().contains(markerLatLng)) {
          map.panTo(markerLatLng);
        }
      }
    }
  });

  const eventHandlers = React.useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onDragEnd(latLng.lat, latLng.lng);
        }
      },
    }),
    [onDragEnd],
  );

  // Efeito para mover o mapa quando a posição do marcador muda via props
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
      map.setView(position, map.getZoom());
    }
  }, [position, map]);

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
};


const MapComponent = ({ center, markerPosition, onMarkerDragEnd, zoom, className }: MapComponentProps) => {
  return (
    <MapContainer 
      center={center} 
      zoom={zoom} 
      scrollWheelZoom={true}
      className={cn("h-full w-full z-0", className)}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DraggableMarker position={markerPosition} onDragEnd={onMarkerDragEnd} />
    </MapContainer>
  );
};

export default MapComponent;