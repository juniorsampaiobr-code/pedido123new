import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { toast } from 'sonner';

export type CartItem = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  image_url?: string | null;
  is_price_by_weight?: boolean;
};

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'id'>) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  setDeliveryFee: (fee: number) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const generateUniqueId = () => Math.random().toString(36).substring(2, 9);

export const CartProvider = ({ children }: { children: React.ReactNode }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);

  const addItem = useCallback((item: Omit<CartItem, 'id'>) => {
    setItems(prevItems => {
      // If it's a weighted item, always add as a new unique item
      if (item.is_price_by_weight) {
        const newItem: CartItem = { ...item, id: generateUniqueId() };
        toast.success(`${item.name} adicionado ao carrinho.`);
        return [...prevItems, newItem];
      }

      // Check if item already exists (based on product_id and notes)
      const existingItemIndex = prevItems.findIndex(
        i => i.product_id === item.product_id && i.notes === item.notes
      );

      if (existingItemIndex > -1) {
        const newItems = [...prevItems];
        newItems[existingItemIndex].quantity += item.quantity;
        toast.success(`Quantidade de ${item.name} atualizada no carrinho.`);
        return newItems;
      } else {
        const newItem: CartItem = { ...item, id: generateUniqueId() };
        toast.success(`${item.name} adicionado ao carrinho.`);
        return [...prevItems, newItem];
      }
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== itemId));
    toast.info("Item removido do carrinho.");
  }, []);

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === itemId ? { ...item, quantity } : item
      )
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    setDeliveryFee(0);
  }, []);

  const { subtotal, totalItems, total } = useMemo(() => {
    const sub = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return {
      subtotal: sub,
      totalItems: count,
      total: sub + deliveryFee,
    };
  }, [items, deliveryFee]);

  const contextValue = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    subtotal,
    deliveryFee,
    total,
    setDeliveryFee,
  }), [items, addItem, removeItem, updateQuantity, clearCart, totalItems, subtotal, deliveryFee, total, setDeliveryFee]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};