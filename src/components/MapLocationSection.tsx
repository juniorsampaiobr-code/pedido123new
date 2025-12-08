import { memo, useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { LazyMap } from './LazyMap';
import { geocodeAddress } from '@/utils/location';
import { Tables } from '@/integrations/supabase/types';

type Restaurant = Tables<'restaurants'>;

interface MapLocationSectionProps {
  markerPosition: [number, number];
  onLocationChange: (lat: number, lng: number) => void;
  updateAddressFields: (address: any) => void;
  restaurant: Restaurant;
}

const MapLocationSectionComponent = ({
  markerPosition,
  onLocationChange,
  updateAddressFields,
  restaurant,
}: MapLocationSectionProps) => {
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  
  const handleReverseGeocode = useCallback(async () => {
    setIsReverseGeocoding(true);
    const loadingToast = toast.loading("Buscando endereço a partir do mapa...");
    
    const [lat, lng] = markerPosition;
    
    try {
      // Usando a API de Geocodificação Reversa do Google Maps (se a chave for válida)
      // Se a chave do Google Maps estiver configurada, podemos usar o serviço do Google.
      // No entanto, para manter a simplicidade e evitar dependências complexas de SDK no frontend,
      // vamos manter a chamada ao Nominatim (OpenStreetMap) para a geocodificação reversa,
      // pois ela é gratuita e já está implementada, mas o mapa será do Google.
      const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      
      const response = await fetch(nominatimUrl);
      if (!response.ok) throw new Error("Falha na geocodificação reversa.");
      
      const data = await response.json();
      
      if (data.address) {
        updateAddressFields(data.address);
        toast.success("Endereço atualizado com base na localização do mapa!");
      } else {
        toast.warning("Não foi possível encontrar um endereço detalhado para esta localização.");
      }
      
    } catch (error: any) {
      toast.error(`Erro na busca reversa: ${error.message}`);
    } finally {
      setIsReverseGeocoding(false);
      toast.dismiss(loadingToast);
    }
  }, [markerPosition, updateAddressFields]);

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
          <p className="text-sm text-muted-foreground max-w-[70%] truncate">
            Endereço atual: {fullAddress || 'N/A'}
          </p>
          <Button 
            type="button" 
            variant="outline" 
            onClick={handleReverseGeocode}
            disabled={isReverseGeocoding}
          >
            {isReverseGeocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar Endereço
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const MapLocationSection = memo(MapLocationSectionComponent);

export { MapLocationSection };