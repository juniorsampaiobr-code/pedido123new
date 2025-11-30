import { useState, useEffect } from 'react';

/**
 * Hook que retorna um valor que só é atualizado após um atraso (delay)
 * desde a última vez que o valor de entrada mudou.
 * @param value O valor a ser 'debouced'.
 * @param delay O atraso em milissegundos.
 * @returns O valor debounced.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Configura um timer para atualizar o valor debounced
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Limpa o timer anterior se o valor mudar antes do delay
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}