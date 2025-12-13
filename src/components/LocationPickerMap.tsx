import React, { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin } from 'lucide-react';
import { LazyMap } from './LazyMap';

interface LocationPickerMapProps {
  initialLat: number;
  initialLng: number;
  onLocationChange: (lat: number, lng: number) => void;
}

const LocationPickerMap = ({ initialLat, initialLng, onLocationChange }: LocationPickerMapProps) => {
  const [currentPosition, setCurrentPosition] = useState<[number, number]>([initialLat, initialLng]);

  const handleDragEnd = useCallback((lat: number, lng: number) => {
    setCurrentPosition([lat, lng]);
    onLocationChange(lat, lng);
  }, [onLocationChange]);

  // Removendo mapKey, pois LazyMap agora lida com a atualização de props
  // const mapKey = useMemo(() => `picker-${initialLat}-${initialLng}`, [initialLat, initialLng]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Selecione a Localização
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-80 w-full rounded-lg overflow-hidden border">
          <LazyMap 
            center={currentPosition}
            markerPosition={currentPosition}
            onMarkerDragEnd={handleDragEnd}
            zoom={15}
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Arraste o pino para ajustar a localização exata.
          <p>Coordenadas: {currentPosition[0].toFixed(6)}, {currentPosition[1].toFixed(6)}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationPickerMap;