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
  ArrowRight,
  X,
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
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center w-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] rounded-2xl shadow-sm focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all p-1.5"
        >
          <Search className="w-4 h-4 text-slate-400 ml-2.5 mr-2 shrink-0 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name or category (e.g. ramen, soap, coffee)..."
            className="w-full bg-transparent border-0 text-slate-900 dark:text-white text-sm placeholder-slate-400 focus:outline-none py-1 min-h-[36px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                const url = new URL('/api/inmate/catalog', window.location.origin);
                if (selectedCategory !== 'All') {
                  url.searchParams.set('category', selectedCategory);
                }
                fetch(url.toString())
                  .then((res) => res.json())
                  .then((data) => {
                    if (data?.products) setProducts(data.products);
                  });
              }}
              className="p-1.5 mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg shrink-0 cursor-pointer transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#1a1a1a] hover:bg-slate-200 dark:hover:bg-[#252525] text-teal-600 dark:text-teal-400 text-xs font-bold transition-all shrink-0 cursor-pointer min-h-[36px] flex items-center justify-center active:scale-95"
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
                      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#181818] border border-teal-500/40 rounded-2xl p-1 shadow-inner">
                        <button
                          type="button"
                          onClick={() => updateQuantity(prod.id, qtyInCart - 1)}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] flex items-center justify-center text-slate-800 dark:text-white transition-all active:scale-95 border border-slate-200 dark:border-[#333333]"
                          title="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-mono font-black text-teal-600 dark:text-teal-400 text-base">
                          {qtyInCart}
                        </span>
                        <button
                          type="button"
                          disabled={qtyInCart >= prod.stock}
                          onClick={() => updateQuantity(prod.id, qtyInCart + 1)}
                          className="min-w-[44px] min-h-[44px] rounded-xl bg-white dark:bg-[#242424] hover:bg-slate-50 dark:hover:bg-[#2e2e2e] flex items-center justify-center text-slate-800 dark:text-white transition-all active:scale-95 border border-slate-200 dark:border-[#333333] disabled:opacity-40"
                          title="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
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

      {/* Sticky Mobile Cart Summary Bar */}
      {totalItems > 0 && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-3 pb-2 pt-1 bg-gradient-to-t from-slate-900/90 via-slate-900/60 to-transparent backdrop-blur-sm safe-bottom">
          <div className="max-w-md mx-auto bg-slate-900 dark:bg-[#161616] border border-teal-500/50 p-3 rounded-2xl shadow-2xl flex items-center justify-between text-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                <ShoppingCart className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold block leading-tight">
                  {totalItems} item{totalItems > 1 ? 's' : ''} in cart
                </span>
                <span className="text-sm font-mono font-black text-teal-400">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
            </div>

            <Link
              href="/inmate/cart"
              className="btn-teal px-4 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
            >
              <span>Review &amp; Pay</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
