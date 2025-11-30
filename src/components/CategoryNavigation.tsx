import React, { useCallback, useState, useEffect } from 'react';
import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type Category = Tables<'categories'>;

interface CategoryNavigationProps {
  categories: (Category & { products: any[] })[];
}

export const CategoryNavigation = ({ categories }: CategoryNavigationProps) => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const handleScrollToCategory = useCallback((categoryId: string) => {
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      // Rola suavemente para o elemento, ajustando o offset para o cabeçalho fixo
      const headerOffset = 120; // Altura aproximada do header + navegação
      const elementPosition = element.getBoundingClientRect().top + window.scrollY;
      const offsetPosition = elementPosition - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
      setActiveCategory(categoryId);
    }
  }, []);
  
  // Efeito para detectar a categoria visível e atualizar o estado ativo
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Define a categoria ativa como a que está entrando na visualização
            const categoryId = entry.target.id.replace('category-', '');
            setActiveCategory(categoryId);
          }
        });
      },
      {
        rootMargin: '-120px 0px -50% 0px', // Ajusta a área de intersecção para o topo da tela
        threshold: 0,
      }
    );

    categories.forEach(category => {
      const element = document.getElementById(`category-${category.id}`);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      categories.forEach(category => {
        const element = document.getElementById(`category-${category.id}`);
        if (element) {
          observer.unobserve(element);
        }
      });
    };
  }, [categories]);


  return (
    <div className="sticky top-16 z-20 bg-card border-b shadow-md">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex space-x-2 p-3 container mx-auto px-4">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={activeCategory === category.id ? 'default' : 'outline'}
              onClick={() => handleScrollToCategory(category.id)}
              className={cn(
                "flex-shrink-0",
                activeCategory === category.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent/50"
              )}
            >
              {category.name}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};