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
      // Ordenamos para processar os tipos mais específicos primeiro para o bairro
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

      // FALLBACK DE SEGURANÇA PARA BAIRRO:
      // Se o bairro ainda estiver vazio, tentamos extrair do formatted_address
      // O formato comum é "Rua, Numero - Bairro, Cidade - Estado, CEP, Pais"
      if (!components.neighborhood && place.formatted_address) {
        console.log('[AddressAutocomplete] Bairro não encontrado nos componentes. Tentando extrair do formatted_address:', place.formatted_address);
        const parts = place.formatted_address.split(',');
        if (parts.length >= 2) {
          // Geralmente o bairro está após o número ou rua
          // "Rua Alonso Keese - Vila Linopolis I, Santa Bárbara d'Oeste - SP, Brasil"
          // Aqui parts[0] = "Rua Alonso Keese - Vila Linopolis I"
          const firstPart = parts[0];
          if (firstPart.includes(' - ')) {
            const subParts = firstPart.split(' - ');
            components.neighborhood = subParts[subParts.length - 1].trim();
            console.log('[AddressAutocomplete] Bairro extraído do fallback:', components.neighborhood);
          }
        }
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