'use client';

import React, { useState, useEffect } from 'react';
import {
  Boxes,
  AlertTriangle,
  PlusCircle,
  CheckCircle2,
  PackageX,
  Loader2,
  X,
  ArrowUpCircle,
  Search,
  ShieldAlert,
  Filter,
} from 'lucide-react';

interface ProductItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  reorderLevel: number;
  active: boolean;
}

interface ShortageItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  reorderLevel: number;
  severity: 'OUT_OF_STOCK' | 'LOW_STOCK';
}

interface AffectedProductOrders {
  productId: string;
  productName: string;
  affectedOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    offender: { id: string; name: string; unit: string };
    items: Array<{ quantity: number }>;
  }>;
}

export default function WarehouseInventoryPage() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [shortages, setShortages] = useState<ShortageItem[]>([]);
  const [affectedOrdersByProduct, setAffectedOrdersByProduct] = useState<AffectedProductOrders[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Staff role tracking
  const [staffRole, setStaffRole] = useState<string | null>(null);
  const isSupervisor = staffRole === 'WAREHOUSE_SUPERVISOR' || staffRole === 'ADMIN';

  // Restock modal state
  const [restockProduct, setRestockProduct] = useState<ProductItem | null>(null);
  const [restockQty, setRestockQty] = useState<string>('50');
  const [restockNotes, setRestockNotes] = useState<string>('Scheduled vendor delivery');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.role) setStaffRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/warehouse/inventory');
      const data = await res.json();
      if (data?.products) setProducts(data.products);
      if (data?.shortages) setShortages(data.shortages);
      if (data?.affectedOrdersByProduct) setAffectedOrdersByProduct(data.affectedOrdersByProduct);
    } catch (err) {
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct || submitting) return;

    const qty = parseInt(restockQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setFeedback({ type: 'error', msg: 'Quantity must be a positive integer.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/warehouse/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: restockProduct.id,
          quantity: qty,
          notes: restockNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update stock');
      }

      setFeedback({
        type: 'success',
        msg: `Successfully restocked ${qty} units of ${restockProduct.name}. New stock: ${data.product.stock}`,
      });
      setRestockProduct(null);
      await fetchInventory();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered categories
  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((prod) => {
    const matchesCategory = categoryFilter === 'ALL' || prod.category === categoryFilter;
    const matchesQuery =
      !searchQuery.trim() ||
      prod.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      prod.sku.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      prod.category.toLowerCase().includes(searchQuery.toLowerCase().trim());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Inventory &amp; Shortages
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-600 dark:text-slate-300">
              {isSupervisor ? 'Supervisor' : 'Picker View'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor commissary bin stock, reorder thresholds, and orders impacted by low inventory.
          </p>
        </div>

        <button
          onClick={fetchInventory}
          className="btn-teal px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 self-start sm:self-auto shadow-sm min-h-[44px] touch-manipulation"
        >
          <Boxes className="w-4 h-4" />
          <span>Refresh Stock</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-sm ${
            feedback.type === 'success'
              ? 'bg-slate-100 dark:bg-[#181818] border-slate-300 dark:border-[#262626] text-slate-900 dark:text-white'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300'
          }`}
        >
          <span className="font-medium">{feedback.msg}</span>
          <button
            onClick={() => setFeedback(null)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Dismiss feedback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Shortage Alerts Panel */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`w-5 h-5 ${
                shortages.length > 0 ? 'text-amber-500' : 'text-teal-500'
              }`}
            />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Shortage Tracking ({shortages.length} Flagged SKU{shortages.length !== 1 ? 's' : ''})
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Threshold: Stock &le; Reorder Level
          </span>
        </div>

        {shortages.length === 0 ? (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] flex items-center gap-2.5 text-xs text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">All commissary SKUs are currently stocked above their reorder thresholds.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shortages.map((item) => {
              const affectedEntry = affectedOrdersByProduct.find(
                (a) => a.productId === item.id
              );
              const affectedList = affectedEntry?.affectedOrders || [];
              const fullProduct = products.find((p) => p.id === item.id);

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-red-600 dark:text-red-400 font-bold">
                        {item.sku}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                        {item.severity === 'OUT_OF_STOCK' ? 'OUT OF STOCK' : 'LOW STOCK'}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">{item.name}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-mono">
                      Current Stock: <strong className="text-red-600 dark:text-red-400">{item.stock}</strong> / Reorder Level: {item.reorderLevel}
                    </p>

                    {/* Affected Pending Orders */}
                    <div className="mt-3 pt-2 border-t border-red-200 dark:border-red-900/40">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                        Affected Pending Orders ({affectedList.length}):
                      </span>
                      {affectedList.length === 0 ? (
                        <span className="text-[11px] text-slate-400">
                          No unfulfilled orders waiting on this SKU
                        </span>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {affectedList.map((ord) => (
                            <li
                              key={ord.id}
                              className="text-[11px] font-mono text-amber-600 dark:text-amber-400 flex justify-between"
                            >
                              <span>
                                {ord.orderNumber} ({ord.offender.name})
                              </span>
                              <span>
                                Qty: {ord.items.reduce((s, i) => s + i.quantity, 0)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {fullProduct && (
                    <div>
                      {isSupervisor ? (
                        <button
                          type="button"
                          onClick={() => setRestockProduct(fullProduct)}
                          className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm min-h-[44px] touch-manipulation"
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          <span>Restock SKU</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic text-center py-1 flex items-center justify-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-amber-500" />
                          <span>Restock restricted to Supervisors</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search and Category Filter Bar */}
      <div className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products by SKU or name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-teal-500 min-h-[44px]"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors min-h-[40px] touch-manipulation ${
                  categoryFilter === cat
                    ? 'bg-teal-500 text-white shadow-sm'
                    : 'bg-slate-50 dark:bg-[#181818] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#262626]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Inventory Cards (< md) */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
          <span>Catalog Inventory ({filteredProducts.length} items)</span>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626] text-xs text-slate-400">
            No products match your search.
          </div>
        ) : (
          filteredProducts.map((prod) => {
            const isLow = prod.stock <= prod.reorderLevel;
            const isOut = prod.stock <= 0;

            return (
              <div
                key={prod.id}
                className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-teal-600 dark:text-teal-400">
                      {prod.sku}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                      {prod.name}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      {prod.category} &bull; ${prod.price.toFixed(2)} / unit
                    </span>
                  </div>

                  <div>
                    {isOut ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                        Out of Stock
                      </span>
                    ) : isLow ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                        Low Stock
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                        Adequate
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">Stock: <strong className={isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-slate-900 dark:text-white'}>{prod.stock}</strong></span>
                  <span className="text-slate-500">Reorder Threshold: <strong>{prod.reorderLevel}</strong></span>
                </div>

                {isSupervisor ? (
                  <button
                    type="button"
                    onClick={() => setRestockProduct(prod)}
                    className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-teal-500 hover:text-white text-teal-600 dark:text-teal-400 text-xs font-bold transition-colors border border-slate-200 dark:border-[#262626] min-h-[44px] touch-manipulation flex items-center justify-center gap-1.5"
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    <span>Restock SKU</span>
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-400 text-center italic py-1">
                    Supervisor role required to restock
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Inventory Table (>= md) */}
      <div className="hidden md:block bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">
          Complete Commissary Catalog Inventory ({filteredProducts.length} items)
        </h2>

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262626] text-slate-500 uppercase text-[10px]">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Product Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-center">Current Stock</th>
                  <th className="py-2.5 px-3 text-center">Reorder Level</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No inventory records available.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => {
                  const isLow = prod.stock <= prod.reorderLevel;
                  const isOut = prod.stock <= 0;

                  return (
                    <tr
                      key={prod.id}
                      className="hover:bg-slate-50 dark:hover:bg-[#181818] transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {prod.sku}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                        {prod.name}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {prod.category}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ${prod.price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center font-mono">
                        <span
                          className={`font-bold ${
                            isOut
                              ? 'text-red-500'
                              : isLow
                              ? 'text-amber-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {prod.stock}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-slate-500">
                        {prod.reorderLevel}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isOut ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                            Adequate
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {isSupervisor ? (
                          <button
                            type="button"
                            onClick={() => setRestockProduct(prod)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202020] text-teal-600 dark:text-teal-400 text-xs font-bold transition-colors border border-slate-200 dark:border-[#262626] min-h-[36px] touch-manipulation"
                          >
                            Restock
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Supervisor only
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Restock Modal */}
      {restockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#262626]">
              <div>
                <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 font-bold uppercase">
                  RESTOCK INVENTORY
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {restockProduct.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRestockProduct(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-400 hover:text-black dark:hover:text-white flex items-center justify-center min-w-[44px] min-h-[44px]"
                aria-label="Close restock modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Units to Add to Stock
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Restock Reference / Vendor Invoice Notes
                </label>
                <input
                  type="text"
                  required
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base sm:text-sm min-h-[44px]"
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs flex justify-between font-mono">
                <span className="text-slate-500">New Resulting Stock:</span>
                <strong className="text-teal-600 dark:text-teal-400">
                  {restockProduct.stock + (parseInt(restockQty, 10) || 0)} units
                </strong>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-teal w-full py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm min-h-[48px] touch-manipulation disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating Inventory...</span>
                    </>
                  ) : (
                    <span>Commit Restock Entry</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRestockProduct(null)}
                  className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-300 text-xs font-semibold min-h-[48px] touch-manipulation hover:bg-slate-200 dark:hover:bg-[#202020]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
