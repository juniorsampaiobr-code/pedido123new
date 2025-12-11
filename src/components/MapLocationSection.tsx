import { memo, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { LazyMap } from './LazyMap';
import { Tables } from '@/integrations/supabase/types';

type Restaurant = Tables<'restaurants'>;

interface MapLocationSectionProps {
  markerPosition: [number, number];
  onLocationChange: (lat: number, lng: number) => void;
  restaurant: Restaurant;
}

const MapLocationSectionComponent = ({ 
  markerPosition, 
  onLocationChange, 
  restaurant,
}: MapLocationSectionProps) => {
  const fullAddress = useMemo(() => {
    return [
      restaurant.street,
      restaurant.number,
      restaurant.neighborhood,
      restaurant.city,
      restaurant.zip_code,
    ].filter(Boolean).join(', ');
  }, [restaurant]);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="h-5 w-5 text-primary" />
          Localização no Mapa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-80 w-full rounded-lg overflow-hidden border">
          <LazyMap 
            center={markerPosition} 
            markerPosition={markerPosition} 
            onMarkerDragEnd={onLocationChange} 
            zoom={15} 
          />
        </div>
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground max-w-[100%] truncate">
            Endereço atual: {fullAddress || 'N/A'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const MapLocationSection = memo(MapLocationSectionComponent);
export { MapLocationSection };