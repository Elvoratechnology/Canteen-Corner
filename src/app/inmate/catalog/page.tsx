'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Minus,
  ShoppingCart,
  Package,
  PackageX,
  Loader2,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  reorderLevel: number;
  active: boolean;
  description?: string;
}

export default function CatalogPage() {
  const { items, addItem, updateQuantity, totalItems, subtotal } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory]);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const url = new URL('/api/inmate/catalog', window.location.origin);
      if (selectedCategory !== 'All') {
        url.searchParams.set('category', selectedCategory);
      }
      if (searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data.products) setProducts(data.products);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts();
  };

  const getItemQuantity = (productId: string) => {
    const item = items.find((i) => i.productId === productId);
    return item ? item.quantity : 0;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Commissary Catalog
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Institutional commissary catalog. Standard weekly limits apply.
          </p>
        </div>

        {totalItems > 0 && (
          <Link
            href="/inmate/cart"
            className="btn-teal inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>View Cart ({totalItems}) &bull; ${subtotal.toFixed(2)}</span>
          </Link>
        )}
      </div>

      {/* Search and Category Filter Bar */}
      <div className="space-y-3">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name or category (e.g. ramen, soap, coffee)..."
            className="w-full pl-10 pr-24 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-sm focus:outline-none focus:border-teal-500 shadow-sm"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1.5 bottom-1.5 px-3.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-slate-700 text-teal-600 dark:text-teal-400 text-xs font-bold transition-colors"
          >
            Search
          </button>
        </form>

        {/* Categories scrollable pill list */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] shadow-sm'
                  : 'bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#262626]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white dark:bg-[#121212] text-center border border-slate-200 dark:border-[#262626]">
          <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No products found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Try another category or search query.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((prod) => {
            const qtyInCart = getItemQuantity(prod.id);
            const isOutOfStock = prod.stock <= 0;

            return (
              <div
                key={prod.id}
                className={`bg-white dark:bg-[#121212] p-5 rounded-3xl border flex flex-col justify-between shadow-sm transition-all ${
                  isOutOfStock
                    ? 'border-slate-200 dark:border-[#262626] opacity-60'
                    : 'border-slate-200 dark:border-[#262626] hover:border-teal-400'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-2 font-mono">
                    <span className="text-teal-600 dark:text-teal-400 font-bold">{prod.category}</span>
                    <span className="text-slate-400">{prod.sku}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {prod.name}
                  </h3>
                  {prod.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {prod.description}
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-[#262626] flex items-center justify-between">
                  <div>
                    <div className="text-xl font-black font-mono text-slate-900 dark:text-white">
                      ${prod.price.toFixed(2)}
                    </div>
                    <div className="text-[11px] mt-0.5">
                      {isOutOfStock ? (
                        <span className="text-red-500 font-semibold flex items-center gap-1">
                          <PackageX className="w-3 h-3" />
                          Out of Stock
                        </span>
                      ) : (
                        <span className="text-slate-400">In Stock ({prod.stock})</span>
                      )}
                    </div>
                  </div>

                  <div>
                    {isOutOfStock ? (
                      <button
                        disabled
                        className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-400 text-xs font-semibold cursor-not-allowed"
                      >
                        Unavailable
                      </button>
                    ) : qtyInCart === 0 ? (
                      <button
                        onClick={() => addItem(prod, 1)}
                        className="btn-teal px-4 py-2 rounded-2xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#181818] border border-teal-500/40 rounded-2xl p-1">
                        <button
                          onClick={() => updateQuantity(prod.id, qtyInCart - 1)}
                          className="w-7 h-7 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white transition-colors"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-7 text-center font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                          {qtyInCart}
                        </span>
                        <button
                          disabled={qtyInCart >= prod.stock}
                          onClick={() => updateQuantity(prod.id, qtyInCart + 1)}
                          className="w-7 h-7 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-black dark:hover:text-white transition-colors disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating cart pill on mobile */}
      {totalItems > 0 && (
        <div className="md:hidden fixed bottom-20 left-4 right-4 z-30">
          <Link
            href="/inmate/cart"
            className="btn-teal w-full py-3 px-5 rounded-2xl flex items-center justify-between shadow-lg font-bold text-sm"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              <span>Checkout ({totalItems} items)</span>
            </div>
            <span className="font-mono text-base">${subtotal.toFixed(2)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
