import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ShoppingCart, DollarSign, Scale } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { useCart } from '@/hooks/use-cart';
import { LazyImage } from './LazyImage';
import { ProductDetailsModal } from './ProductDetailsModal';
import { WeightProductModal } from './WeightProductModal';
import { toast } from 'sonner'; // Importando toast

type Product = Tables<'products'>;

interface ProductCardProps {
  product: Product;
  isCheckoutBlocked: boolean; // Nova prop
}

const ProductCardComponent = ({ product, isCheckoutBlocked }: ProductCardProps) => {
  const { addItem } = useCart();
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);

  const handleAddToCart = (quantity: number = 1, notes: string = '') => {
    if (isCheckoutBlocked) {
      toast.error("A loja está fechada.", { description: "Não é possível adicionar itens ao carrinho ou finalizar o pedido no momento." });
      return;
    }
    addItem(product, quantity, notes);
  };

  const handleQuickAdd = () => {
    if (isCheckoutBlocked) {
      toast.error("A loja está fechada.", { description: "Não é possível adicionar itens ao carrinho ou finalizar o pedido no momento." });
      return;
    }
    if (product.is_price_by_weight) {
      setIsWeightModalOpen(true);
    } else {
      handleAddToCart(1, '');
    }
  };

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  return (
    <>
      <ProductDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        product={product}
        onAddToCart={handleAddToCart}
        isCheckoutBlocked={isCheckoutBlocked} // Passando a prop
      />
      <WeightProductModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        product={product}
        onAddToCart={handleAddToCart}
        isCheckoutBlocked={isCheckoutBlocked} // Passando a prop
      />
      
      <Card className="overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col">
        <div className="relative cursor-pointer" onClick={() => setIsDetailsModalOpen(true)}>
          <LazyImage
            src={product.image_url || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-48 object-cover"
          />
          {product.is_price_by_weight && (
            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <Scale className="h-3 w-3" /> Preço por Peso
            </div>
          )}
        </div>
        <CardContent className="p-4 flex-grow flex flex-col justify-between">
          <div className="flex-grow">
            <h3 className="text-lg font-semibold mb-1 truncate">{product.name}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{product.description}</p>
          </div>
          <div className="flex items-center justify-between pt-3 border-t">
            <p className="text-xl font-bold text-primary flex items-center gap-1">
              <DollarSign className="h-5 w-5" />
              {formatPrice(product.price)}
              {product.is_price_by_weight && <span className="text-sm font-normal text-muted-foreground">/kg</span>}
            </p>
            <Button size="icon" onClick={handleQuickAdd} disabled={isCheckoutBlocked}>
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};

export { ProductCardComponent as ProductCard };