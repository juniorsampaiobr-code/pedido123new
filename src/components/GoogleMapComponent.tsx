import React, { useEffect, useRef } from 'react';
import { Wrapper, Status } from "@googlemaps/react-wrapper";
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
const MapContent: React.FC<GoogleMapComponentProps> = ({ 
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
    if (!ref.current) return;

    // Cria o mapa
    const map = new google.maps.Map(ref.current, {
      center,
      zoom,
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
      google.maps.event.clearInstanceListeners(map);
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
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

// Função de renderização do status
const render = (status: Status) => {
  if (status === Status.LOADING) return <LoadingSpinner />;
  if (status === Status.FAILURE) {
    toast.error("Falha ao carregar o Google Maps. Verifique a chave de API.");
    return <div className="flex items-center justify-center h-full text-destructive">Erro ao carregar o mapa.</div>;
  }
  return null;
};

// Componente Wrapper principal que carrega o SDK
export const GoogleMapComponent: React.FC<GoogleMapComponentProps> = (props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
  
  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Erro: Chave VITE_GOOGLE_MAPS_API_KEY não configurada.
      </div>
    );
  }

  return (
    <Wrapper apiKey={apiKey} render={render} libraries={["places"]}>
      <MapContent {...props} />
    </Wrapper>
  );
};