'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  Calendar,
  Wallet,
  Clock,
  ArrowRight,
  Home,
  ShieldCheck,
  Package,
} from 'lucide-react';

interface OrderConfirmationData {
  id: string;
  orderNumber: string;
  total: number;
  expectedDeliveryDate: string;
  status: string;
  newBalance: number;
}

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('id');
  const [order, setOrder] = useState<OrderConfirmationData | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('cc_last_order');
      if (stored) {
        setOrder(JSON.parse(stored));
        return;
      }
    } catch {}

    if (orderId) {
      fetch(`/api/inmate/orders/${orderId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.order) {
            setOrder({
              id: data.order.id,
              orderNumber: data.order.orderNumber,
              total: data.order.total,
              expectedDeliveryDate: data.order.expectedDeliveryDate,
              status: data.order.status,
              newBalance: 0,
            });
          }
        });
    }
  }, [orderId]);

  const deliveryFormatted = order?.expectedDeliveryDate
    ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : 'Upcoming Thursday';

  return (
    <div className="max-w-xl mx-auto py-8 sm:py-12">
      <div className="bg-white dark:bg-[#121212] p-6 sm:p-10 rounded-3xl border border-slate-200 dark:border-[#262626] text-center shadow-lg relative overflow-hidden transition-colors">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-teal-400 mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <span className="text-xs font-bold text-teal-600 dark:text-teal-400 tracking-wider uppercase">
          Order Successfully Placed
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
          {order?.orderNumber || '#CC-Order'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-sm mx-auto">
          Your order has been routed to the facility fulfillment warehouse queue for picking and packaging.
        </p>

        <div className="my-6 p-4 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-left space-y-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#262626]">
            <span className="text-slate-500 dark:text-slate-400">Order Number:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-base">
              {order?.orderNumber || 'Pending'}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#262626]">
            <span className="text-slate-500 dark:text-slate-400">Total Deducted:</span>
            <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-base">
              ${order?.total ? order.total.toFixed(2) : '0.00'}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#262626]">
            <span className="text-slate-500 dark:text-slate-400">Expected Delivery:</span>
            <div className="text-right">
              <span className="font-semibold text-slate-900 dark:text-white block">{deliveryFormatted}</span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">Unit Distribution (14:00)</span>
            </div>
          </div>

          {order?.newBalance !== undefined && order.newBalance > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Updated Current Balance:</span>
              <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                ${order.newBalance.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Link
            href="/inmate/orders"
            className="btn-teal w-full py-3 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span>View Order History</span>
          </Link>

          <Link
            href="/inmate"
            className="w-full py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-[#202020] text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm border border-slate-200 dark:border-[#262626] flex items-center justify-center gap-2 transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
