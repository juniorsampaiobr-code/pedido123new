import { useState, useEffect } from 'react';

const useIsMobile = (breakpoint = 1024) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Define o estado inicial
    checkIsMobile();

    // Adiciona listener para mudanças de tamanho
    window.addEventListener('resize', checkIsMobile);

    // Limpa o listener
    return () => window.removeEventListener('resize', checkIsMobile);
  }, [breakpoint]);

  return isMobile;
};

export { useIsMobile };