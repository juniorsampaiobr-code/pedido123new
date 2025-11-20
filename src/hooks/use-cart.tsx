import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type Product = Tables<'products'>;

interface CartItem {
  product: Product;
  quantity: number;
  notes: string;
  subtotal: number;
}

interface CartContextType {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  addItem: (product: Product, quantity: number, notes: string) => void;
  removeItem: (productId: string) => void;
  updateItemQuantity: (productId: string, newQuantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const loadCartFromStorage = (): CartItem[] => {
  if (typeof window !== 'undefined') {
    const storedCart = localStorage.getItem('cart');
    return storedCart ? JSON.parse(storedCart) : [];
  }
  return [];
};

const saveCartToStorage = (items: CartItem[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cart', JSON.stringify(items));
  }
};

const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>(loadCartFromStorage);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const totalAmount = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);

  React.useEffect(() => {
    saveCartToStorage(items);
  }, [items]);

  const addItem = useCallback((product: Product, quantity: number, notes: string) => {
    setItems(prevItems => {
      const existingItemIndex = prevItems.findIndex(item => item.product.id === product.id);

      const subtotal = product.price * quantity;

      if (existingItemIndex > -1) {
        // Atualiza item existente
        const updatedItems = [...prevItems];
        const existingItem = updatedItems[existingItemIndex];
        
        // Se for um produto pesável, substitui a quantidade e subtotal
        if (product.is_price_by_weight) {
            existingItem.quantity = quantity;
            existingItem.subtotal = subtotal;
        } else {
            // Se não for pesável, apenas adiciona a quantidade
            existingItem.quantity += quantity;
            existingItem.subtotal += subtotal;
        }
        
        existingItem.notes = notes;
        
        toast.success(`${product.name} atualizado no carrinho!`);
        return updatedItems;
      } else {
        // Adiciona novo item
        const newItem: CartItem = { product, quantity, notes, subtotal };
        toast.success(`${product.name} adicionado ao carrinho!`);
        return [...prevItems, newItem];
      }
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(prevItems => {
      const updatedItems = prevItems.filter(item => item.product.id !== productId);
      toast.info('Item removido do carrinho.');
      return updatedItems;
    });
  }, []);

  const updateItemQuantity = useCallback((productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems(prevItems => {
      const updatedItems = prevItems.map(item => {
        if (item.product.id === productId) {
          const newSubtotal = item.product.price * newQuantity;
          return { ...item, quantity: newQuantity, subtotal: newSubtotal };
        }
        return item;
      });
      return updatedItems;
    });
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    toast.info('Carrinho limpo.');
  }, []);

  const value = useMemo(() => ({
    items,
    totalItems,
    totalAmount,
    addItem,
    removeItem,
    updateItemQuantity,
    clearCart,
  }), [items, totalItems, totalAmount, addItem, removeItem, updateItemQuantity, clearCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartProvider;