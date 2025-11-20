import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface StatCardProps {
  value: string;
  label: string;
  delay?: number;
}

// Componente simples de cartão de estatística para a página Index
export const StatCard = ({ value, label, delay = 0 }: StatCardProps) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className={cn("text-center p-2 transition-opacity duration-500", isVisible ? "opacity-100" : "opacity-0")}>
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
};