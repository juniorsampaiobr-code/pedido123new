import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TimeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Função para aplicar a máscara HH:MM
const applyTimeMask = (value: string): string => {
  // 1. Remove todos os caracteres não numéricos
  let cleaned = value.replace(/\D/g, '');

  // 2. Limita a 4 dígitos (HHMM)
  if (cleaned.length > 4) {
    cleaned = cleaned.slice(0, 4);
  }

  // 3. Aplica a máscara HH:MM
  if (cleaned.length > 2) {
    cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
  }
  
  return cleaned;
};

export const TimeInput = React.forwardRef<HTMLInputElement, TimeInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const maskedValue = applyTimeMask(rawValue);
      
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
        className={cn("w-24 text-center", className)}
        placeholder="HH:MM"
        value={value}
        onChange={handleChange}
        maxLength={5} // 2 digits + ':' + 2 digits = 5 characters
        {...props}
      />
    );
  }
);
TimeInput.displayName = "TimeInput";