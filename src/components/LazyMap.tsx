import React, { lazy, Suspense, useMemo } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import 'leaflet/dist/leaflet.css';

// Define o tipo das props esperadas pelo componente MapComponent
interface MapComponentProps {
  center: [number, number];
  markerPosition: [number, number];
  onMarkerDragEnd: (lat: number, lng: number) => void;
  zoom: number;
}

// Carregamento dinâmico do componente MapComponent
// Ajuste para lidar com a exportação default
const MapComponent = lazy(() => import('./MapComponent').then(module => ({ default: module.default })));

// Componente auxiliar que encapsula o carregamento dinâmico
const LazyMap = (props: MapComponentProps) => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MapComponent {...props} />
    </Suspense>
  );
};

// Exportação nomeada
export { LazyMap };