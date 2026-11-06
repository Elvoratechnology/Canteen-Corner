'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  ChevronRight,
  Printer,
  Camera,
  Barcode,
  Loader2,
  X,
} from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    stock: number;
  };
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  status: 'PROCESSING' | 'PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  subtotal: number;
  total: number;
  barcode: string;
  expectedDeliveryDate: string;
  createdAt: string;
  offender: {
    id: string;
    name: string;
    unit: string;
    housing: string;
  };
  items: OrderItem[];
  pickingList?: {
    id: string;
    status: 'PENDING' | 'PICKING' | 'PACKED';
  };
}

export default function WarehouseQueuePage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  const fetchOrders = async (keepId?: string) => {
    try {
      setLoading(true);
      const url = new URL('/api/warehouse/orders', window.location.origin);
      if (statusFilter !== 'ALL') {
        url.searchParams.set('status', statusFilter);
      }

      const res = await fetch(url.toString());
      const data = await res.json();
      if (data?.orders) {
        setOrders(data.orders);
        if (keepId) {
          const match = data.orders.find((o: OrderRecord) => o.id === keepId);
          if (match) setSelectedOrder(match);
        } else if (data.orders.length > 0 && !selectedOrder) {
          setSelectedOrder(data.orders[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const executeOrderAction = async (
    action: 'START_PICKING' | 'MARK_PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVER',
    barcodeInput?: string
  ) => {
    if (!selectedOrder) return;
    setActionLoading(true);
    setFeedback(null);

    try {
      const res = await fetch(`/api/warehouse/orders/${selectedOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, barcode: barcodeInput }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Action failed');
      }

      if (data.order) {
        setSelectedOrder(data.order);
        await fetchOrders(data.order.id);
      }

      setFeedback({
        type: 'success',
        msg: `Order ${selectedOrder.orderNumber} successfully updated!`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: OrderRecord['status']) => {
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

  // Status pills counts
  const totalCount = orders.length;
  const processingCount = orders.filter((o) => o.status === 'PROCESSING').length;
  const packedCount = orders.filter((o) => o.status === 'PACKED').length;
  const outDeliveryCount = orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;

  const statusTabs = [
    { id: 'ALL', label: `All Orders (${totalCount})` },
    { id: 'PROCESSING', label: `Processing (${processingCount})` },
    { id: 'PACKED', label: `Packed (${packedCount})` },
    { id: 'OUT_FOR_DELIVERY', label: `Out for Delivery (${outDeliveryCount})` },
    { id: 'DELIVERED', label: `Delivered (${deliveredCount})` },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header Matching Image 2 Screen 3 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Incoming Orders Queue &amp; Picking Station
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select an order to view details and start picking.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchOrders(selectedOrder?.id)}
          className="btn-teal px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Pills Matching Image 2 Screen 3 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar no-print">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-teal-500 text-white font-bold shadow-sm'
                  : 'bg-white dark:bg-[#121212] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#262626]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`no-print p-3.5 rounded-2xl border text-xs flex items-center justify-between shadow-sm ${
            feedback.type === 'success'
              ? 'bg-slate-100 dark:bg-[#181818] border-slate-300 dark:border-[#262626] text-slate-900 dark:text-white'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <span className="font-medium">{feedback.msg}</span>
          <button onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Two-Pane Layout Matching Image 2 Screen 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Queue List (5 cols) */}
        <div className="lg:col-span-5 space-y-3 no-print max-h-[75vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-400">Loading queue...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
              <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No orders in this status.</p>
            </div>
          ) : (
            orders.map((ord) => {
              const isSelected = selectedOrder?.id === ord.id;
              const dateStr = new Date(ord.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={ord.id}
                  onClick={() => {
                    setSelectedOrder(ord);
                    setFeedback(null);
                  }}
                  className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-[#1c1c1c] border-teal-500 ring-2 ring-teal-500/20 shadow-sm'
                      : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#262626] hover:border-slate-400 dark:hover:border-slate-600 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                      {ord.orderNumber}
                    </span>
                    {getStatusBadge(ord.status)}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {ord.offender.name} &bull; {ord.offender.unit}
                      </span>
                      <span className="text-[11px] font-mono">Placed {dateStr}</span>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Details Pane (7 cols) Matching Image 2 Screen 3 */}
        <div className="lg:col-span-7">
          {!selectedOrder ? (
            <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl border border-slate-200 dark:border-[#262626] text-center">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Select an order from the queue
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#121212] p-5 sm:p-7 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-6 shadow-sm">
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#262626]">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-black font-mono text-slate-900 dark:text-white">
                      Order {selectedOrder.orderNumber}
                    </h2>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                    Placed: {new Date(selectedOrder.createdAt).toLocaleDateString()} &bull;{' '}
                    {new Date(selectedOrder.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block uppercase font-medium">
                    Total
                  </span>
                  <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
                    ${selectedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Inmate Info */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Offender</span>
                  <strong className="text-slate-900 dark:text-white">{selectedOrder.offender.name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">ID / Unit</span>
                  <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">
                    {selectedOrder.offender.id} ({selectedOrder.offender.unit})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Cell Block</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedOrder.offender.housing}</span>
                </div>
              </div>

              {/* Items List Matching Image 2 Screen 3 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Items ({selectedOrder.items.reduce((s, i) => s + i.quantity, 0)})
                </h3>

                <div className="divide-y divide-slate-100 dark:divide-[#262626] border border-slate-200 dark:border-[#262626] rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-[#181818]">
                  {selectedOrder.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        {/* Item Icon */}
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] flex items-center justify-center text-teal-500 font-bold shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white text-sm block">
                            {item.product.name}
                          </span>
                          <span className="text-slate-500 text-[11px] font-mono">
                            {item.product.sku} &bull; {item.product.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <span className="font-mono text-slate-600 dark:text-slate-400">
                          Qty: <strong className="text-slate-900 dark:text-white">{item.quantity}</strong>
                        </span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                          ${item.totalPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Big Bottom Teal Action Button Matching Image 2 Screen 3 */}
              <div className="pt-2 no-print">
                {selectedOrder.status === 'PROCESSING' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => executeOrderAction('MARK_PACKED')}
                    className="btn-teal w-full py-4 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-600 active:scale-[0.99] transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Mark as Picked &amp; Packaged</span>
                      </>
                    )}
                  </button>
                )}

                {selectedOrder.status === 'PACKED' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => executeOrderAction('OUT_FOR_DELIVERY')}
                    className="w-full py-4 rounded-2xl bg-teal-600 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-700 transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Truck className="w-5 h-5" />
                        <span>Dispatch Out for Delivery</span>
                      </>
                    )}
                  </button>
                )}

                {selectedOrder.status === 'OUT_FOR_DELIVERY' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => executeOrderAction('DELIVER')}
                    className="w-full py-4 rounded-2xl bg-teal-700 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-800 transition-all"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirm Unit Delivery</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Secondary Print / Scan Buttons */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-[#262626] no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-[#262626] flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Picking Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualBarcode(selectedOrder.barcode);
                    setScannerOpen(true);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-[#262626] flex items-center justify-center gap-1.5"
                >
                  <Barcode className="w-4 h-4" />
                  <span>Verify Barcode</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barcode verification modal */}
      {scannerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm no-print">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-[#262626]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Barcode Verification ({selectedOrder.orderNumber})
              </h3>
              <button onClick={() => setScannerOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs">
              <span className="text-slate-500 dark:text-slate-400">Package Barcode:</span>
              <strong className="font-mono text-teal-600 dark:text-teal-400 block text-sm mt-0.5">
                {selectedOrder.barcode}
              </strong>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Scan or Enter Barcode
              </label>
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] font-mono text-sm"
              />
            </div>

            <button
              onClick={() => {
                setScannerOpen(false);
                executeOrderAction('MARK_PACKED', manualBarcode);
              }}
              className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold"
            >
              Confirm Match &amp; Seal Package
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
