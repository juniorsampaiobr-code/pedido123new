import { Tables } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Product = Tables<'products'>;

interface ProductListItemProps {
  product: Product;
  onEditClick: (product: Product) => void;
  onUpdateStatus: (checked: boolean) => void;
  onDeleteClick: (productId: string) => void;
}

export const ProductListItem = ({ 
  product, 
  onEditClick, 
  onUpdateStatus, 
  onDeleteClick 
}: ProductListItemProps) => {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent transition-colors">
      <div className="flex items-center gap-4">
        <img
          src={product.image_url || '/placeholder.svg'}
          alt={product.name}
          className="w-16 h-16 object-cover rounded-md border"
        />
        <div>
          <h3 className="font-semibold">{product.name}</h3>
          <p className="text-sm text-muted-foreground">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <Badge variant={product.is_available ? "default" : "secondary"}>
          {product.is_available ? "Disponível" : "Indisponível"}
        </Badge>
        <Switch
          checked={product.is_available ?? false}
          onCheckedChange={onUpdateStatus}
        />
        <Button variant="ghost" size="icon" onClick={() => onEditClick(product)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => onDeleteClick(product.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};