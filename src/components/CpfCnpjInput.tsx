import React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CpfCnpjInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// Função para aplicar a máscara de CPF (XXX.XXX.XXX-XX) ou CNPJ (XX.XXX.XXX/XXXX-XX)
const applyCpfCnpjMask = (value: string): string => {
  let cleaned = value.replace(/\D/g, '');

  // Limita a 14 dígitos (máximo para CNPJ)
  if (cleaned.length > 14) {
    cleaned = cleaned.slice(0, 14);
  }

  if (cleaned.length <= 11) {
    // CPF (11 dígitos)
    if (cleaned.length > 9) {
      cleaned = `${cleaned.slice(0, 9)}-${cleaned.slice(9)}`;
    }
    if (cleaned.length > 6) {
      cleaned = `${cleaned.slice(0, 6)}.${cleaned.slice(6)}`;
    }
    if (cleaned.length > 3) {
      cleaned = `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
    }
    return cleaned;
  } else {
    // CNPJ (14 dígitos)
    if (cleaned.length > 12) {
      cleaned = `${cleaned.slice(0, 12)}-${cleaned.slice(12)}`;
    }
    if (cleaned.length > 8) {
      cleaned = `${cleaned.slice(0, 8)}/${cleaned.slice(8)}`;
    }
    if (cleaned.length > 5) {
      cleaned = `${cleaned.slice(0, 5)}.${cleaned.slice(5)}`;
    }
    if (cleaned.length > 2) {
      cleaned = `${cleaned.slice(0, 2)}.${cleaned.slice(2)}`;
    }
    return cleaned;
  }
};

export const CpfCnpjInput = React.forwardRef<HTMLInputElement, CpfCnpjInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const maskedValue = applyCpfCnpjMask(rawValue);
      
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
        placeholder="CPF ou CNPJ"
        value={value}
        onChange={handleChange}
        maxLength={18} // Max length for CNPJ mask (14 digits + 4 separators)
        {...props}
      />
    );
  }
);
CpfCnpjInput.displayName = "CpfCnpjInput";