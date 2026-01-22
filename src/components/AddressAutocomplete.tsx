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
      place.address_components.forEach((component) => {
        const types = component.types;

        if (types.includes('route')) {
          components.street = component.long_name;
        }
        if (types.includes('street_number')) {
          components.number = component.long_name;
        }
        if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
          components.neighborhood = component.long_name;
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