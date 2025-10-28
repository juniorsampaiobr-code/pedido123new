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
      <div className="relative h-48">
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
        "p-4 flex flex-col flex-grow",
        isUnavailable && "opacity-60"
      )}>
        <h3 className="text-xl font-semibold mb-1 truncate">{name}</h3>
        <p className="text-sm text-muted-foreground mb-3 flex-grow line-clamp-2">
          {description}
        </p>
        <p className="text-lg font-bold text-primary text-right mt-2">
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