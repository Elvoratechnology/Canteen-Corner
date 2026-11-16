'use client';

import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  RefreshCw,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  ChevronRight,
  Printer,
  Barcode,
  Loader2,
  X,
  CheckSquare,
  Square,
  ArrowLeft,
  ShieldAlert,
  Search,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Staff role tracking
  const [staffRole, setStaffRole] = useState<string | null>(null);

  // Mobile adaptive master-detail view: 'queue' or 'detail'
  const [mobileView, setMobileView] = useState<'queue' | 'detail'>('queue');

  // Interactive picker item checklist (in-memory for active pick session)
  const [checkedItemIds, setCheckedItemIds] = useState<Record<string, boolean>>({});

  // Scanner modal state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');

  const isSupervisor = staffRole === 'WAREHOUSE_SUPERVISOR' || staffRole === 'ADMIN';

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.role) setStaffRole(data.user.role);
      })
      .catch(() => {});
  }, []);

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
          if (match) {
            setSelectedOrder(match);
          }
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

  const handleSelectOrder = (order: OrderRecord) => {
    setSelectedOrder(order);
    setFeedback(null);
    setCheckedItemIds({});
    setMobileView('detail');
  };

  const toggleItemChecked = (itemId: string) => {
    setCheckedItemIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const executeOrderAction = async (
    action: 'START_PICKING' | 'MARK_PACKED' | 'OUT_FOR_DELIVERY' | 'DELIVER',
    barcodeInput?: string
  ) => {
    if (!selectedOrder || actionLoading) return;
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
        msg: `Order ${selectedOrder.orderNumber} successfully updated (${action.replace(/_/g, ' ')})!`,
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

  // Filtered orders by search
  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.offender.name.toLowerCase().includes(q) ||
      o.offender.id.toLowerCase().includes(q) ||
      o.offender.unit.toLowerCase().includes(q) ||
      o.barcode.toLowerCase().includes(q)
    );
  });

  // Status counts
  const totalCount = orders.length;
  const processingCount = orders.filter((o) => o.status === 'PROCESSING').length;
  const packedCount = orders.filter((o) => o.status === 'PACKED').length;
  const outDeliveryCount = orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;

  const statusTabs = [
    { id: 'ALL', label: `All (${totalCount})` },
    { id: 'PROCESSING', label: `Processing (${processingCount})` },
    { id: 'PACKED', label: `Packed (${packedCount})` },
    { id: 'OUT_FOR_DELIVERY', label: `Out for Delivery (${outDeliveryCount})` },
    { id: 'DELIVERED', label: `Delivered (${deliveredCount})` },
  ];

  // Selected order picking progress calculation
  const totalItemKinds = selectedOrder?.items.length || 0;
  const pickedItemKinds = selectedOrder
    ? selectedOrder.items.filter((i) => checkedItemIds[i.id]).length
    : 0;
  const isAllItemsChecked = totalItemKinds > 0 && pickedItemKinds === totalItemKinds;

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Orders &amp; Picking Station
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-600 dark:text-slate-300">
                {isSupervisor ? 'Supervisor' : 'Picker'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pick, pack, verify barcodes, and prepare institutional commissary orders.
            </p>
          </div>
        </div>

        <button
          onClick={() => fetchOrders(selectedOrder?.id)}
          className="btn-teal px-4 py-2.5 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 self-start sm:self-auto shadow-sm min-h-[44px] touch-manipulation"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Filter Pills & Search */}
      <div className="space-y-2.5 no-print">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders by Order #, Inmate Name, ID, or Unit..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-teal-500 shadow-sm min-h-[44px]"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all min-h-[40px] touch-manipulation ${
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
          <button
            onClick={() => setFeedback(null)}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Dismiss feedback"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Adaptive Layout: Side-by-Side on Desktop/Tablet Landscape, Master-Detail Drilldown on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Orders Queue List (Visible on desktop OR when mobileView === 'queue') */}
        <div
          className={`lg:col-span-5 space-y-3 no-print ${
            mobileView === 'detail' ? 'hidden lg:block' : 'block'
          } max-h-[75vh] overflow-y-auto pr-1`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 px-1">
            <span>Orders Queue ({filteredOrders.length})</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-teal-600 dark:text-teal-400 hover:underline"
              >
                Clear Search
              </button>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-2" />
              <span className="text-xs text-slate-400">Loading queue...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#121212] rounded-3xl border border-slate-200 dark:border-[#262626]">
              <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No orders available</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {orders.length === 0
                  ? 'All inmate commissary orders have been picked or none have been submitted yet.'
                  : 'No orders match the selected filters.'}
              </p>
            </div>
          ) : (
            filteredOrders.map((ord) => {
              const isSelected = selectedOrder?.id === ord.id;
              const dateStr = new Date(ord.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={ord.id}
                  onClick={() => handleSelectOrder(ord)}
                  className={`p-4 rounded-3xl border cursor-pointer transition-all touch-manipulation min-h-[80px] ${
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
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[200px] sm:max-w-none">
                        {ord.offender.name} &bull; {ord.offender.unit}
                      </span>
                      <span className="text-[11px] font-mono">
                        {ord.items.reduce((s, i) => s + i.quantity, 0)} items &bull; Placed {dateStr}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-teal-600 dark:text-teal-400 font-mono font-bold">
                      <span>${ord.total.toFixed(2)}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Details Pane (Visible on desktop OR when mobileView === 'detail') */}
        <div
          className={`lg:col-span-7 ${
            mobileView === 'queue' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Mobile Back Button */}
          <div className="lg:hidden mb-3 no-print">
            <button
              type="button"
              onClick={() => setMobileView('queue')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm min-h-[44px] touch-manipulation"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Orders Queue</span>
            </button>
          </div>

          {!selectedOrder ? (
            <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl border border-slate-200 dark:border-[#262626] text-center">
              <Package className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Select an order from the queue to start fulfillment
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#121212] p-5 sm:p-7 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-6 shadow-sm">
              {/* Order Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#262626]">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
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
                    Order Total
                  </span>
                  <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
                    ${selectedOrder.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Inmate Info Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Inmate Name</span>
                  <strong className="text-slate-900 dark:text-white text-sm">{selectedOrder.offender.name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">ID / Unit</span>
                  <span className="font-mono text-teal-600 dark:text-teal-400 font-bold text-sm">
                    {selectedOrder.offender.id} ({selectedOrder.offender.unit})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Cell Housing</span>
                  <span className="text-slate-800 dark:text-slate-200 font-medium">{selectedOrder.offender.housing}</span>
                </div>
              </div>

              {/* Interactive Item Picking Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Fulfillment Checklist ({pickedItemKinds} of {totalItemKinds} items checked)
                  </h3>
                  {selectedOrder.status === 'PROCESSING' && (
                    <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium">
                      Tap items to mark picked
                    </span>
                  )}
                </div>

                {/* Visual Progress Bar */}
                {totalItemKinds > 0 && selectedOrder.status === 'PROCESSING' && (
                  <div className="w-full bg-slate-100 dark:bg-[#181818] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-teal-500 h-full transition-all duration-300"
                      style={{ width: `${(pickedItemKinds / totalItemKinds) * 100}%` }}
                    />
                  </div>
                )}

                <div className="divide-y divide-slate-100 dark:divide-[#262626] border border-slate-200 dark:border-[#262626] rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-[#181818]">
                  {selectedOrder.items.map((item) => {
                    const isChecked = !!checkedItemIds[item.id] || selectedOrder.status !== 'PROCESSING';
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (selectedOrder.status === 'PROCESSING') {
                            toggleItemChecked(item.id);
                          }
                        }}
                        className={`p-3.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                          selectedOrder.status === 'PROCESSING'
                            ? 'cursor-pointer hover:bg-slate-100/70 dark:hover:bg-[#202020]'
                            : ''
                        } ${isChecked ? 'bg-teal-50/30 dark:bg-teal-950/10' : ''}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {selectedOrder.status === 'PROCESSING' && (
                            <button
                              type="button"
                              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 min-w-[44px] min-h-[44px] touch-manipulation"
                              aria-label={`Toggle pick status for ${item.product.name}`}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                          )}

                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] flex items-center justify-center text-teal-500 font-bold shrink-0">
                            <Package className="w-5 h-5" />
                          </div>

                          <div className="min-w-0">
                            <span className={`font-bold text-slate-900 dark:text-white text-sm block truncate ${
                              isChecked && selectedOrder.status === 'PROCESSING' ? 'line-through text-slate-400 dark:text-slate-500' : ''
                            }`}>
                              {item.product.name}
                            </span>
                            <span className="text-slate-500 text-[11px] font-mono">
                              SKU: {item.product.sku} &bull; Bin Stock: {item.product.stock}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 text-right">
                          <span className="font-mono text-slate-600 dark:text-slate-400 text-xs">
                            Qty: <strong className="text-slate-900 dark:text-white text-sm">{item.quantity}</strong>
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                            ${item.totalPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Action Buttons */}
              <div className="pt-2 no-print space-y-2.5">
                {selectedOrder.status === 'PROCESSING' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => executeOrderAction('MARK_PACKED')}
                    className="btn-teal w-full py-4 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-600 active:scale-[0.99] transition-all min-h-[48px] touch-manipulation disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>
                          {isAllItemsChecked
                            ? 'Complete Packing & Seal Package'
                            : 'Mark as Picked & Packaged'}
                        </span>
                      </>
                    )}
                  </button>
                )}

                {selectedOrder.status === 'PACKED' && (
                  <div>
                    {isSupervisor ? (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => executeOrderAction('OUT_FOR_DELIVERY')}
                        className="w-full py-4 rounded-2xl bg-teal-600 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-700 transition-all min-h-[48px] touch-manipulation disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Truck className="w-5 h-5" />
                            <span>Dispatch Out for Delivery (Supervisor)</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>
                          Order is packaged. Dispatch for delivery requires Warehouse Supervisor authorization.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.status === 'OUT_FOR_DELIVERY' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => executeOrderAction('DELIVER')}
                    className="w-full py-4 rounded-2xl bg-teal-700 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:bg-teal-800 transition-all min-h-[48px] touch-manipulation disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Confirm Unit Delivery to Offender</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Secondary Print / Scan Buttons */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-100 dark:border-[#262626] no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-[#262626] flex items-center justify-center gap-2 min-h-[44px] touch-manipulation hover:bg-slate-200 dark:hover:bg-[#222222] transition-colors"
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
                  className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-[#262626] flex items-center justify-center gap-2 min-h-[44px] touch-manipulation hover:bg-slate-200 dark:hover:bg-[#222222] transition-colors"
                >
                  <Barcode className="w-4 h-4" />
                  <span>Verify Barcode</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barcode Verification Modal */}
      {scannerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm no-print">
          <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-[#262626]">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Barcode Verification ({selectedOrder.orderNumber})
              </h3>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white min-w-[44px] min-h-[44px]"
                aria-label="Close scanner modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-xs">
              <span className="text-slate-500 dark:text-slate-400">Order Package Barcode:</span>
              <strong className="font-mono text-teal-600 dark:text-teal-400 block text-base mt-0.5">
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
                className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] font-mono text-base sm:text-sm min-h-[44px]"
                placeholder="Scan with handheld reader..."
              />
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setScannerOpen(false);
                  executeOrderAction('MARK_PACKED', manualBarcode);
                }}
                className="btn-teal w-full py-3 rounded-2xl text-xs font-bold min-h-[44px] touch-manipulation disabled:opacity-50"
              >
                Confirm Match &amp; Seal Package
              </button>
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-300 text-xs font-semibold min-h-[44px] touch-manipulation hover:bg-slate-200 dark:hover:bg-[#202020]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
