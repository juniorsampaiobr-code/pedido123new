import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LazyMap } from './LazyMap';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClientLocationMapProps {
  latitude: number;
  longitude: number;
  address: string;
  className?: string;
}

const ClientLocationMapComponent = ({ latitude, longitude, address, className }: ClientLocationMapProps) => {
  const markerPosition: [number, number] = useMemo(() => [latitude, longitude], [latitude, longitude]);
  const mapCenter: [number, number] = useMemo(() => [latitude, longitude], [latitude, longitude]);

  // Removendo mapKey, pois LazyMap agora lida com a atualização de props
  // const mapKey = useMemo(() => `client-location-${latitude.toFixed(6)}-${longitude.toFixed(6)}`, [latitude, longitude]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Sua Localização
        </CardTitle>
        <p className="text-sm text-muted-foreground truncate">{address}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-64 w-full rounded-b-lg overflow-hidden">
          <LazyMap
            center={mapCenter}
            markerPosition={markerPosition}
            onMarkerDragEnd={() => {}} // Não permitimos arrastar neste contexto
            zoom={16}
          />
        </div>
      </CardContent>
    </Card>
  );
};

// Exportação nomeada para evitar problemas de importação
export { ClientLocationMapComponent as ClientLocationMap };