'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Wallet,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';

interface OffenderBalanceInfo {
  balance: number;
  weeklyLimit: number;
  currentWeeklySpent: number;
  remainingWeeklyLimit: number;
  availableSpending: number;
}

export default function CartPage() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, clearCart, totalItems, subtotal } = useCart();
  const [balanceInfo, setBalanceInfo] = useState<OffenderBalanceInfo | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/inmate/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data?.offender) {
          setBalanceInfo({
            balance: data.offender.balance,
            weeklyLimit: data.offender.weeklyLimit,
            currentWeeklySpent: data.offender.currentWeeklySpent,
            remainingWeeklyLimit: data.offender.remainingWeeklyLimit,
            availableSpending: data.offender.availableSpending,
          });
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingBalance(false));
  }, []);

  const total = subtotal;
  const currentBalance = balanceInfo?.balance ?? 0;
  const remainingWeeklyLimit = balanceInfo?.remainingWeeklyLimit ?? 0;
  const projectedBalance = Math.round((currentBalance - total) * 100) / 100;
  const projectedRemainingWeekly = Math.round((remainingWeeklyLimit - total) * 100) / 100;

  const exceedsBalance = total > currentBalance;
  const exceedsWeeklyLimit = total > remainingWeeklyLimit;
  const canSubmit = items.length > 0 && !exceedsBalance && !exceedsWeeklyLimit && !submitting;

  const handleSubmitOrder = async () => {
    if (!canSubmit) return;
    setSubmissionError(null);
    setSubmitting(true);

    try {
      const payload = {
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
      };

      const res = await fetch('/api/inmate/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit order');
      }

      clearCart();
      sessionStorage.setItem('cc_last_order', JSON.stringify(data.order));
      router.push(`/inmate/order-confirmation?id=${data.order.id}`);
    } catch (err: any) {
      setSubmissionError(err.message || 'An error occurred while placing your order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="bg-white dark:bg-[#121212] p-8 sm:p-12 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Your Cart is Empty</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6 max-w-sm mx-auto">
            Browse the commissary catalog to select approved snacks, hygiene essentials, and stationery.
          </p>
          <Link
            href="/inmate/catalog"
            className="btn-teal inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-xs sm:text-sm shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Start Shopping Catalog</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/inmate/catalog"
            className="w-10 h-10 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-700 dark:text-slate-300 hover:text-teal-500 flex items-center justify-center shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Review Commissary Order
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {totalItems} item{totalItems > 1 ? 's' : ''} in cart
            </p>
          </div>
        </div>

        <button
          onClick={clearCart}
          className="text-xs text-red-500 hover:underline flex items-center gap-1 font-semibold"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear Cart</span>
        </button>
      </div>

      {submissionError && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs sm:text-sm">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{submissionError}</div>
        </div>
      )}

      {exceedsBalance && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Insufficient Trust Funds:</span> Order total (${total.toFixed(2)}) exceeds your current balance of ${currentBalance.toFixed(2)}. Please reduce item quantities before submitting.
          </div>
        </div>
      )}

      {!exceedsBalance && exceedsWeeklyLimit && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Weekly Limit Exceeded:</span> Order total (${total.toFixed(2)}) exceeds your remaining weekly limit of ${remainingWeeklyLimit.toFixed(2)}.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Items List */}
        <div className="lg:col-span-2 space-y-3">
          {items.map((item) => (
            <div
              key={item.productId}
              className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] flex items-center justify-between gap-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-bold">{item.sku} &bull; {item.category}</span>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base truncate">{item.name}</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  ${item.price.toFixed(2)} each
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-slate-700 rounded-2xl p-1">
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                  className="w-7 h-7 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                  {item.quantity}
                </span>
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                  disabled={item.quantity >= item.stock}
                  className="w-7 h-7 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Subtotal & Delete */}
              <div className="text-right shrink-0">
                <div className="text-sm sm:text-base font-black font-mono text-slate-900 dark:text-white">
                  ${(item.price * item.quantity).toFixed(2)}
                </div>
                <button
                  onClick={() => removeItem(item.productId)}
                  className="text-[11px] text-slate-400 hover:text-red-500 mt-1 block"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          <div className="pt-2">
            <Link
              href="/inmate/catalog"
              className="inline-flex items-center gap-2 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
            >
              <Plus className="w-4 h-4" />
              <span>Continue Shopping Catalog</span>
            </Link>
          </div>
        </div>

        {/* Summary Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm sticky top-24">
            <h2 className="text-base font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-[#262626]">
              Order Summary
            </h2>

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal ({totalItems} items):</span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Institutional Tax:</span>
                <span className="font-mono text-slate-900 dark:text-white">$0.00</span>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-[#262626] flex justify-between text-base font-bold text-slate-900 dark:text-white">
                <span>Total:</span>
                <span className="font-mono text-teal-600 dark:text-teal-400 text-lg">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Reconciliation Box */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626] text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400 font-bold mb-1">
                <Wallet className="w-3.5 h-3.5" />
                <span>Account Balance Check</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Current Balance:</span>
                <span className="font-mono">${currentBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Order Total:</span>
                <span className="font-mono text-red-500">-${total.toFixed(2)}</span>
              </div>
              <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold">
                <span className="text-slate-800 dark:text-slate-200">Balance After:</span>
                <span className={`font-mono ${exceedsBalance ? 'text-red-500' : 'text-teal-600 dark:text-teal-400'}`}>
                  ${projectedBalance.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmitOrder}
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] font-extrabold text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Order...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submit Order (${total.toFixed(2)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
