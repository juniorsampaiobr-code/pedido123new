import React, { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface AddressComponents {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  onAddressSelect: (address: AddressComponents) => void;
  defaultValue?: string;
  disabled?: boolean;
}

export const AddressAutocomplete = ({ onAddressSelect, defaultValue, disabled }: AddressAutocompleteProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const autoCompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current || !window.google || !window.google.maps || !window.google.maps.places) {
      return;
    }

    autoCompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'br' },
      fields: ['address_components', 'geometry', 'formatted_address'],
      types: ['address'],
    });

    autoCompleteRef.current.addListener('place_changed', () => {
      const place = autoCompleteRef.current?.getPlace();

      if (!place || !place.address_components || !place.geometry) {
        return;
      }

      const components: AddressComponents = {
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: '',
        latitude: place.geometry.location?.lat() || 0,
        longitude: place.geometry.location?.lng() || 0,
      };

      // Mapeamento dos componentes do Google Maps para o nosso formato
      // Tipos de bairro mais comuns no Brasil
      const neighborhoodTypes = [
        'sublocality_level_1', 
        'neighborhood', 
        'sublocality', 
        'sublocality_level_2', 
        'sublocality_level_3'
      ];

      place.address_components.forEach((component) => {
        const types = component.types;

        if (types.includes('route')) {
          components.street = component.long_name;
        }
        if (types.includes('street_number')) {
          components.number = component.long_name;
        }
        
        // Captura o bairro baseado na lista de prioridade
        for (const type of neighborhoodTypes) {
          if (types.includes(type) && !components.neighborhood) {
            components.neighborhood = component.long_name;
            break;
          }
        }

        if (types.includes('administrative_area_level_2') || types.includes('locality')) {
          components.city = component.long_name;
        }
        if (types.includes('administrative_area_level_1')) {
          components.state = component.short_name;
        }
        if (types.includes('postal_code')) {
          components.zip_code = component.long_name.replace(/\D/g, ''); // Remove não dígitos
        }
      });

      // --- LÓGICA DE FALLBACK ROBUSTA PARA BAIRRO ---
      // Se o bairro ainda estiver vazio ou for igual à rua (erro comum do Google Maps)
      if (!components.neighborhood || components.neighborhood === components.street) {
        const fullText = place.formatted_address || '';
        console.log('[AddressAutocomplete] Iniciando extração forçada de bairro do texto:', fullText);

        // 1. Tenta extrair o que está entre a rua e a cidade/estado, usando vírgulas como delimitadores
        const parts = fullText.split(',');
        
        // Encontra a parte que contém a rua (geralmente a primeira)
        const streetPartIndex = parts.findIndex(p => p.includes(components.street));
        
        // Se a rua foi encontrada e há pelo menos 3 partes (rua, número/bairro, cidade)
        if (streetPartIndex !== -1 && parts.length > streetPartIndex + 1) {
            let potentialNeighborhood = parts[streetPartIndex + 1].trim();
            
            // Se a parte contém o número, o bairro pode estar na próxima parte
            if (potentialNeighborhood.includes(components.number) && parts.length > streetPartIndex + 2) {
                potentialNeighborhood = parts[streetPartIndex + 2].trim();
            }
            
            // Limpeza: remove números, CEPs e siglas de estado
            const isZipCode = /^\d{5}-\d{3}$/.test(potentialNeighborhood) || /^\d{8}$/.test(potentialNeighborhood);
            const isState = /^[A-Z]{2}$/.test(potentialNeighborhood);
            const isOnlyNumbers = /^\d+$/.test(potentialNeighborhood);
            
            if (!isZipCode && !isState && !isOnlyNumbers && potentialNeighborhood.length > 2) {
                components.neighborhood = potentialNeighborhood;
            }
        }
        
        // 2. Fallback final: se o bairro ainda for igual à rua, limpa para não confundir
        if (components.neighborhood === components.street) {
          components.neighborhood = '';
        }
        
        console.log('[AddressAutocomplete] Resultado final da extração de bairro:', components.neighborhood);
      }

      onAddressSelect(components);
    });
  }, [onAddressSelect]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        placeholder="Busque seu endereço (Rua, Número...)"
        defaultValue={defaultValue}
        className="pl-10 h-12"
        disabled={disabled}
      />
    </div>
  );
};