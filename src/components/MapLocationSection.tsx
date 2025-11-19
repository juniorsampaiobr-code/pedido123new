import React, { useMemo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { LazyMap } from '@/components/LazyMap';
import { toast } from 'sonner';
import { Tables } from '@/integrations/supabase/types';

type Restaurant = Tables<'restaurants'>;

interface MapLocationSectionProps {
  markerPosition: [number, number];
  onLocationChange: (lat: number, lng: number) => void;
  updateAddressFields: (address: any) => void;
  restaurant: Restaurant | undefined;
  // Adicionando uma chave para forçar a recriação do mapa quando as coordenadas mudam
  mapKey: string; 
}

const MapLocationSectionComponent = ({ 
  markerPosition, 
  onLocationChange, 
  updateAddressFields, 
  restaurant,
  mapKey
}: MapLocationSectionProps) => {
  const lat = markerPosition[0];
  const lng = markerPosition[1];
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Função para buscar o endereço a partir das coordenadas (Geocodificação Reversa)
  const handleReverseGeocode = useCallback(async (newLat: number, newLng: number) => {
    setIsReverseGeocoding(true);
    const loadingToast = toast.loading("Buscando endereço para a nova localização...");
    
    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&addressdetails=1`;
      const response = await fetch(reverseUrl);
      if (!response.ok) throw new Error("Falha ao obter detalhes do endereço.");

      const data = await response.json();
      if (data.address) {
        updateAddressFields(data.address);
        toast.success("Endereço atualizado a partir do mapa.");
      } else {
        toast.warning("Não foi possível encontrar um endereço para esta localização.");
      }
    } catch (err: any) {
      toast.error(`Erro ao buscar endereço: ${err.message}`);
    } finally {
      setIsReverseGeocoding(false);
      toast.dismiss(loadingToast);
    }
  }, [updateAddressFields]);

  // Adicionando verificação de coordenadas válidas aqui
  const isLocationValid = Number.isFinite(lat) && Number.isFinite(lng);

  if (!isLocationValid) {
    // Retorna null se as coordenadas não forem válidas, garantindo que o LazyMap não seja montado.
    return (
      <Alert variant="default">
        <MapPin className="h-4 w-4" />
        <AlertTitle>Aguardando Localização</AlertTitle>
        <AlertDescription>
            Aguarde o salvamento do endereço para visualizar o mapa.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2 relative">
      <div className="relative">
        {/* O LazyMap é o componente que contém o Leaflet e usa a chave para controle */}
        <LazyMap 
          key={mapKey} 
          center={markerPosition} 
          markerPosition={markerPosition} 
          onLocationChange={onLocationChange} 
          isInteractive={true}
        />
        
        {/* Botão de Geocodificação Reversa (Opcional no Checkout, mas útil para Settings) */}
        {/* Removendo o botão de busca reversa para simplificar o fluxo do Checkout, onde o usuário deve usar o botão "Salvar Endereço" principal. */}
      </div>
      
      <div className="text-xs text-muted-foreground flex justify-between">
        <span>Latitude: {lat?.toFixed(6)}</span>
        <span>Longitude: {lng?.toFixed(6)}</span>
      </div>
      <Alert variant="default">
          <MapPin className="h-4 w-4" />
          <AlertTitle>Ajuste a Localização</AlertTitle>
          <AlertDescription>
              Arraste o pino azul para o local exato da entrega para garantir a precisão da taxa.
          </AlertDescription>
      </Alert>
    </div>
  );
};

export const MapLocationSection = React.memo(MapLocationSectionComponent);