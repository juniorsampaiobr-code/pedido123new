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
const MapComponent = lazy(() => import('./MapComponent'));

// Componente auxiliar que encapsula o carregamento dinâmico
const LazyMap = (props: MapComponentProps) => {
  // Se o MapComponent não existir, criamos um placeholder para ele.
  // No entanto, como o MapComponent não está no contexto, vamos assumir que ele existe
  // e que a importação dinâmica é o suficiente para resolver o problema de exportação.
  
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MapComponent {...props} />
    </Suspense>
  );
};

// Exportação nomeada
export { LazyMap };