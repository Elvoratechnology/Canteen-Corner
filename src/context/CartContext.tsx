'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  stock: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: { id: string; sku: string; name: string; category: string; price: number; stock: number }, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cc_inmate_cart');
      if (saved) {
        setItems(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to parse cart storage', e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('cc_inmate_cart', JSON.stringify(items));
    } catch (e) {
      console.error('Failed to sync cart storage', e);
    }
  }, [items]);

  const addItem = (product: { id: string; sku: string; name: string; category: string; price: number; stock: number }, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + qty);
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: newQty } : i));
      } else {
        const initialQty = Math.min(product.stock, qty);
        return [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            category: product.category,
            price: product.price,
            quantity: initialQty,
            stock: product.stock,
          },
        ];
      }
    });
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.productId === productId) {
          const clamped = Math.min(i.stock, quantity);
          return { ...i, quantity: clamped };
        }
        return i;
      })
    );
  };

  const clearCart = () => {
    setItems([]);
    try {
      localStorage.removeItem('cc_inmate_cart');
    } catch {}
  };

  const totalItems = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotal = Math.round(items.reduce((acc, i) => acc + i.price * i.quantity, 0) * 100) / 100;

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        subtotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

