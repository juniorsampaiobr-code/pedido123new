import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LazyImage } from '@/components/LazyImage';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ProductCardProps {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_price_by_weight?: boolean | null;
  is_available?: boolean | null;
  onClick: () => void;
}

export const ProductCard = memo(({ 
  id,
  name,
  description,
  price,
  image_url,
  is_price_by_weight,
  is_available,
  onClick
}: ProductCardProps) => {
  const isUnavailable = is_available === false;

  return (
    <Card 
      key={id} 
      className={cn(
        "overflow-hidden group transition-shadow duration-300 flex flex-col",
        isUnavailable 
          ? "cursor-not-allowed" 
          : "hover:shadow-xl cursor-pointer"
      )}
      onClick={onClick}
    >
      <div className="relative h-32 sm:h-40"> {/* Reduzindo a altura da imagem */}
        <LazyImage 
          src={image_url || '/placeholder.svg'} 
          alt={name} 
          className={cn(
            "w-full h-full object-cover",
            !isUnavailable && "group-hover:scale-105 transition-transform duration-300",
            isUnavailable && "filter grayscale"
          )}
        />
        {isUnavailable && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Badge variant="destructive" className="text-lg">Indisponível</Badge>
          </div>
        )}
      </div>
      <CardContent className={cn(
        "p-3 flex flex-col flex-grow", // Padding mais compacto
        isUnavailable && "opacity-60"
      )}>
        <h3 className="text-base sm:text-lg font-semibold mb-1 truncate">{name}</h3> {/* Reduzindo o tamanho do título */}
        <p className="text-xs text-muted-foreground mb-2 flex-grow line-clamp-2"> {/* Reduzindo o tamanho da descrição */}
          {description}
        </p>
        <p className="text-base font-bold text-primary text-right mt-2"> {/* Mantendo o preço legível */}
          {is_price_by_weight 
            ? `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)} / kg`
            : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
          }
        </p>
      </CardContent>
    </Card>
  );
});

ProductCard.displayName = 'ProductCard';