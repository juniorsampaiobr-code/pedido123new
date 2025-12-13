import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Função para aplicar a máscara (XX) XXXXX-XXXX
const applyPhoneMask = (value: string): string => {
  // 1. Remove todos os caracteres não numéricos
  let cleaned = value.replace(/\D/g, '');

  // 2. Limita a 11 dígitos (DDD + 9 dígitos)
  if (cleaned.length > 11) {
    cleaned = cleaned.slice(0, 11);
  }

  // 3. Aplica a máscara
  if (cleaned.length > 0) {
    cleaned = `(${cleaned}`;
  }
  if (cleaned.length > 3) {
    cleaned = `${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  }
  if (cleaned.length > 10) {
    cleaned = `${cleaned.slice(0, 10)}-${cleaned.slice(10)}`;
  }
  
  return cleaned;
};

export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const maskedValue = applyPhoneMask(rawValue);
      
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
        placeholder="(99) 99999-9999"
        value={value}
        onChange={handleChange}
        {...props}
      />
    );
  }
);
PhoneInput.displayName = "PhoneInput";