import React, { lazy, Suspense } from 'react';
import { LoadingSpinner } from './LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapPin } from 'lucide-react';

// Carregamento dinâmico do componente do mapa
const LocationPickerMap = lazy(() => 
  import('./LocationPickerMap')
);

interface LazyMapProps {
  center: [number, number];
  markerPosition: [number, number];
  onLocationChange: (lat: number, lng: number) => void;
  isInteractive?: boolean;
}

export const LazyMap = (props: LazyMapProps) => {
  return (
    <Suspense fallback={
      <div className="h-96 w-full rounded-lg bg-muted flex items-center justify-center">
        <LoadingSpinner />
      </div>
    }>
      <LocationPickerMap {...props} />
    </Suspense>
  );
};