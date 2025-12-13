import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ZipCodeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Função para aplicar a máscara XXXXX-XXX
const applyZipCodeMask = (value: string): string => {
  // 1. Remove todos os caracteres não numéricos
  let cleaned = value.replace(/\D/g, '');

  // 2. Limita a 8 dígitos
  if (cleaned.length > 8) {
    cleaned = cleaned.slice(0, 8);
  }

  // 3. Aplica a máscara
  if (cleaned.length > 5) {
    cleaned = `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
  }
  
  return cleaned;
};

export const ZipCodeInput = React.forwardRef<HTMLInputElement, ZipCodeInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const maskedValue = applyZipCodeMask(rawValue);
      
      // Cria um evento sintético para passar o valor mascarado
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          value: maskedValue,
        },
      } as React.ChangeEvent<HTMLInputElement>;
      
      onChange(syntheticEvent);
    };

    return (
      <Input
        ref={ref}
        type="tel"
        className={cn("w-full", className)}
        placeholder="00000-000"
        value={value}
        onChange={handleChange}
        maxLength={9} // 5 digits + '-' + 3 digits = 9 characters
        {...props}
      />
    );
  }
);
ZipCodeInput.displayName = "ZipCodeInput";