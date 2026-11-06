'use client';

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Package,
  Calendar,
  CheckCircle2,
  Truck,
  ArrowRight,
  X,
  Barcode,
  Loader2,
} from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: {
    sku: string;
    name: string;
    category: string;
  };
}

interface Order {
  id: string;
  orderNumber: string;
  status: 'PROCESSING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  total: number;
  subtotal: number;
  barcode: string;
  expectedDeliveryDate: string;
  deliveredAt?: string;
  createdAt: string;
  items: OrderItem[];
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetch('/api/inmate/orders')
      .then((res) => res.json())
      .then((data) => {
        if (data?.orders) setOrders(data.orders);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-400 border border-teal-300 dark:border-teal-700">
            <CheckCircle2 className="w-3 h-3" />
            Delivered
          </span>
        );
      case 'OUT_FOR_DELIVERY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400 border border-blue-300 dark:border-blue-700">
            <Truck className="w-3 h-3" />
            Out for Delivery
          </span>
        );
      case 'PACKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-300 dark:border-purple-700">
            <Package className="w-3 h-3" />
            Packed
          </span>
        );
      case 'PROCESSING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
            <Clock className="w-3 h-3" />
            Processing
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Order History
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review your past commissary orders, delivery statuses, and package receipts.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl text-center border border-slate-200 dark:border-[#262626]">
          <Clock className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Orders Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">You have not placed any commissary orders yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const dateStr = new Date(order.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const itemCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

            return (
              <div
                key={order.id}
                className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-teal-400 transition-all"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                        {order.orderNumber}
                      </span>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>Placed: {dateStr}</span>
                      <span>&bull;</span>
                      <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-[#262626]">
                  <div className="text-left sm:text-right">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">Total</span>
                    <span className="font-mono font-black text-teal-600 dark:text-teal-400 text-lg">
                      ${order.total.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors"
                  >
                    <span>View Details</span>
                    <ArrowRight className="w-3.5 h-3.5 text-teal-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-lg p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#262626]">
              <div>
                <span className="text-[10px] font-mono text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider">
                  COMMISSARY RECEIPT
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Order {selectedOrder.orderNumber}
                </h2>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-400 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626] flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Status</span>
                <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
              </div>
              <div className="text-right font-mono">
                <span className="text-slate-400 text-[11px] block flex items-center justify-end gap-1">
                  <Barcode className="w-3.5 h-3.5 text-teal-500" />
                  <span>{selectedOrder.barcode}</span>
                </span>
                <span className="text-slate-500 text-[10px]">
                  {new Date(selectedOrder.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Item Breakdown
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50 dark:bg-[#181818]/40 border border-slate-200 dark:border-[#262626] rounded-2xl p-3 space-y-2 text-xs">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="pt-2 first:pt-0 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white block">{item.product.name}</span>
                      <span className="text-slate-500 text-[10px]">
                        {item.quantity} &times; ${item.unitPrice.toFixed(2)}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      ${item.totalPrice.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626] flex justify-between items-center text-sm font-bold">
              <span className="text-slate-700 dark:text-slate-300">Total Deducted:</span>
              <span className="font-mono text-teal-600 dark:text-teal-400 text-base font-black">
                ${selectedOrder.total.toFixed(2)}
              </span>
            </div>

            <button
              onClick={() => setSelectedOrder(null)}
              className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold"
            >
              Close Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
