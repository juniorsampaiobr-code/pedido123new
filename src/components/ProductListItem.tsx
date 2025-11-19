import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Product = Tables<'products'>;

interface ProductListItemProps {
  product: Product;
  onEditClick: (product: Product) => void;
  onUpdateStatus: (is_available: boolean) => void;
  onDeleteClick: (productId: string) => void; // Nova prop
}

export const ProductListItem = ({ product, onEditClick, onUpdateStatus, onDeleteClick }: ProductListItemProps) => {
  return (
    <Card className="flex items-center gap-4 p-4">
      <img
        src={product.image_url || '/placeholder.svg'}
        alt={product.name}
        className="w-24 h-24 object-cover rounded-md"
      />
      <div className="flex-grow">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{product.name}</h3>
          {product.is_available && <Badge>Disponível</Badge>}
        </div>
        <p className="text-lg font-bold text-primary mt-1">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={`list-active-${product.id}`} className="text-sm font-medium">Ativo</label>
          <Switch
            id={`list-active-${product.id}`}
            checked={product.is_available ?? false}
            onCheckedChange={onUpdateStatus}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => onEditClick(product)}>
            <Edit className="h-4 w-4" />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza que deseja excluir este produto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é permanente. O produto "{product.name}" será removido do cardápio e de todos os pedidos futuros.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => onDeleteClick(product.id)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
};