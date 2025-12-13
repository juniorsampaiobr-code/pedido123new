import React, { lazy, Suspense, useMemo } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

// Removendo import 'leaflet/dist/leaflet.css';

// Define o tipo das props esperadas pelo componente MapComponent
interface MapComponentProps {
  center: [number, number];
  markerPosition: [number, number];
  onMarkerDragEnd: (lat: number, lng: number) => void;
  zoom: number;
  className?: string;
}

// Carregamento dinâmico do componente GoogleMapComponent
const GoogleMapComponent = lazy(() => import('./GoogleMapComponent').then(module => ({ default: module.GoogleMapComponent })));

// Componente auxiliar que encapsula o carregamento dinâmico
const LazyMap = (props: MapComponentProps) => {
  const { center, markerPosition, onMarkerDragEnd, zoom } = props;
  
  // Converte as coordenadas [lat, lng] para o formato { lat, lng } exigido pelo Google Maps
  const googleCenter = useMemo(() => ({
    lat: center[0],
    lng: center[1]
  }), [center]);
  
  const googleMarkerPosition = useMemo(() => ({
    lat: markerPosition[0],
    lng: markerPosition[1]
  }), [markerPosition]);

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <GoogleMapComponent 
        center={googleCenter} 
        markerPosition={googleMarkerPosition} 
        onMarkerDragEnd={onMarkerDragEnd} 
        zoom={zoom} 
      />
    </Suspense>
  );
};

// Exportação nomeada
export { LazyMap };