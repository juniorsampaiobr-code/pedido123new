import React, { useEffect, useRef } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { toast } from 'sonner';

// Definindo os tipos das props esperadas
interface GoogleMapComponentProps {
  center: { lat: number; lng: number };
  markerPosition: { lat: number; lng: number };
  onMarkerDragEnd: (lat: number, lng: number) => void;
  zoom: number;
  className?: string;
}

// Componente interno que renderiza o mapa e o marcador
export const GoogleMapComponent: React.FC<GoogleMapComponentProps> = ({ 
  center, 
  markerPosition, 
  onMarkerDragEnd, 
  zoom,
  className 
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Inicializa o mapa e o marcador
  useEffect(() => {
    if (!ref.current || typeof google === 'undefined' || !google.maps) {
      // Se o SDK não estiver carregado (o que não deve acontecer se o Wrapper no App.tsx funcionar)
      return;
    }

    // Cria o mapa
    const map = new google.maps.Map(ref.current, {
      center,
      zoom,
      // Desabilita controles desnecessários para uma experiência mais limpa
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    
    mapRef.current = map;

    // Cria o marcador
    const marker = new google.maps.Marker({
      position: markerPosition,
      map,
      draggable: true,
    });
    
    markerRef.current = marker;

    // Listener para o evento de arrastar o marcador
    marker.addListener("dragend", () => {
      const position = marker.getPosition();
      if (position) {
        onMarkerDragEnd(position.lat(), position.lng());
      }
    });

    // Cleanup ao desmontar o componente
    return () => {
      if (mapRef.current) {
        google.maps.event.clearInstanceListeners(mapRef.current);
      }
      if (markerRef.current) {
        google.maps.event.clearInstanceListeners(markerRef.current);
        markerRef.current.setMap(null);
      }
    };
  }, []); // useEffect vazio roda apenas uma vez na montagem

  // Atualiza a posição do marcador e o centro do mapa quando as props mudam
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      const newPosition = new google.maps.LatLng(markerPosition.lat, markerPosition.lng);
      markerRef.current.setPosition(newPosition);
      mapRef.current.setCenter(newPosition);
      mapRef.current.setZoom(zoom);
    }
  }, [markerPosition, zoom, center]);

  return <div ref={ref} className={className} style={{ height: '100%', width: '100%' }} />;
};