import { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LazyImage } from '@/components/LazyImage';

interface ProductCardProps {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_price_by_weight?: boolean | null;
  onClick: () => void;
}

export const ProductCard = memo(({ 
  id,
  name,
  description,
  price,
  image_url,
  is_price_by_weight,
  onClick
}: ProductCardProps) => {
  return (
    <Card 
      key={id} 
      className="overflow-hidden group hover:shadow-xl transition-shadow duration-300 flex flex-col cursor-pointer"
      onClick={onClick}
    >
      <div className="relative h-48">
        <LazyImage 
          src={image_url || '/placeholder.svg'} 
          alt={name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
        />
      </div>
      <CardContent className="p-4 flex flex-col flex-grow">
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