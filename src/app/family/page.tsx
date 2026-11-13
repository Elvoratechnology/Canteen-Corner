'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Search,
  User,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ArrowRight,
  CreditCard,
  Building,
  MoreHorizontal,
  Loader2,
  Printer,
  Receipt,
  Mail,
  AlertCircle,
} from 'lucide-react';

interface OffenderSearchResult {
  id: string;
  name: string;
  unit: string;
  housing: string;
  facilityName: string;
  maxDepositAmount: number;
}

interface CompletedDepositReceipt {
  providerRef: string;
  amount: number;
  fee: number;
  totalPaid: number;
  offenderName: string;
  offenderId: string;
  facilityName: string;
  completedAt: string;
}

export default function FamilyDepositFundsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<OffenderSearchResult[]>([]);

  // Default selected offender: John Smith (matches seeded demo or Marcus Miller in mock)
  const [selectedOffender, setSelectedOffender] = useState<OffenderSearchResult | null>({
    id: 'A1234567',
    name: 'John Smith',
    unit: 'Unit 4',
    housing: 'Cell Block B',
    facilityName: 'Cumberland Regional Correctional Center',
    maxDepositAmount: 300,
  });

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'paypal'>('card');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  const [pendingIntent, setPendingIntent] = useState<any | null>(null);
  const [receipt, setReceipt] = useState<CompletedDepositReceipt | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/family/offenders/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data?.offenders && data.offenders.length > 0) {
        setSearchResults(data.offenders);
        setSelectedOffender(data.offenders[0]);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const getEffectiveAmount = (): number => {
    if (customAmount.trim()) {
      const parsed = parseFloat(customAmount);
      return isNaN(parsed) ? 0 : parsed;
    }
    return selectedPreset || 0;
  };

  const handleContinuePayment = async () => {
    if (!selectedOffender) return;
    const amount = getEffectiveAmount();

    if (amount <= 0) {
      setDepositError('Please select or enter a valid deposit amount.');
      return;
    }

    if (amount > selectedOffender.maxDepositAmount) {
      setDepositError(`Maximum single deposit allowed by facility is $${selectedOffender.maxDepositAmount.toFixed(2)}.`);
      return;
    }

    setDepositError(null);
    setDepositLoading(true);

    try {
      const res = await fetch('/api/family/deposits/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offenderId: selectedOffender.id,
          amount,
          provider: selectedPaymentMethod === 'paypal' ? 'paypal' : 'stripe',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize deposit');
      }

      setPendingIntent(data.intent);
    } catch (err: any) {
      setDepositError(err.message || 'Payment initiation failed');
    } finally {
      setDepositLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!pendingIntent || !selectedOffender) return;

    setDepositLoading(true);
    try {
      const res = await fetch('/api/family/deposits/simulate-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerRef: pendingIntent.providerRef }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Confirmation failed');
      }

      setReceipt({
        providerRef: pendingIntent.providerRef,
        amount: pendingIntent.amount,
        fee: pendingIntent.fee,
        totalPaid: pendingIntent.totalPaid,
        offenderName: selectedOffender.name,
        offenderId: selectedOffender.id,
        facilityName: selectedOffender.facilityName,
        completedAt: new Date().toISOString(),
      });

      setPendingIntent(null);
    } catch (err: any) {
      setDepositError(err.message || 'Payment failed');
    } finally {
      setDepositLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header matching Image 2 Screen 2 */}
      <div className="flex items-center gap-3">
        <Link
          href="/family"
          className="w-10 h-10 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-teal-500 shadow-sm transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Deposit Funds
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Add funds to an inmate&apos;s account securely.
          </p>
        </div>
      </div>

      {/* Search Input Bar with Teal Search Button (Matching Image 2 Screen 2) */}
      <form onSubmit={handleSearch} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Offender ID or Name..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-teal-500 transition-colors shadow-sm"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="btn-teal px-6 py-2.5 rounded-2xl text-xs font-bold shrink-0 shadow-sm flex items-center gap-1.5"
        >
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Search</span>}
        </button>
      </form>

      {/* Selected Offender Card (Matching Image 2 Screen 2) */}
      {selectedOffender && (
        <div className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-sm">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {selectedOffender.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                ID: {selectedOffender.id} &bull; {selectedOffender.unit}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetailsModal(true)}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
          >
            View Details
          </button>
        </div>
      )}

      {/* Deposit Amount Selection */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
          Choose Deposit Amount
        </span>

        {/* Presets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[20, 30, 50, 100].map((amt) => {
            const isSelected = selectedPreset === amt && !customAmount;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setSelectedPreset(amt);
                  setCustomAmount('');
                }}
                className={`py-3 rounded-2xl font-mono text-base font-bold border transition-all ${isSelected
                    ? 'bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] border-teal-500 dark:border-[#00dfa2] shadow-sm'
                    : 'bg-slate-50 dark:bg-[#181818]/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#262626] hover:border-teal-500'
                  }`}
              >
                ${amt}.00
              </button>
            );
          })}
        </div>

        {/* Custom amount */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
            Or Custom Amount (Facility Limit: $300.00)
          </label>
          <div className="relative max-w-xs">
            <span className="absolute left-3.5 top-2.5 font-mono text-slate-400 font-bold">$</span>
            <input
              type="number"
              step="0.01"
              min="5"
              max="300"
              value={customAmount}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedPreset(null);
              }}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-2 rounded-2xl bg-slate-50 dark:bg-[#181818]/40 border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono text-base"
            />
          </div>
        </div>

        {/* Breakdown */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626]/80 text-xs space-y-1.5">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Credited to Inmate:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              ${getEffectiveAmount().toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Electronic Processing Fee:</span>
            <span className="font-mono text-slate-900 dark:text-white">$3.50</span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
            <span>Total Payment Amount:</span>
            <span className="font-mono text-teal-600 dark:text-teal-400">
              ${(getEffectiveAmount() + 3.50).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Select Payment Method Grid (Matching Image 2 Screen 2 exactly!) */}
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
          Select Payment Method
        </span>

        <div className="grid grid-cols-2 gap-3">
          {/* 1. Credit / Debit Card (Stripe) */}
          <div
            onClick={() => setSelectedPaymentMethod('card')}
            className={`p-4 rounded-3xl cursor-pointer border transition-all flex flex-col items-center text-center justify-between min-h-[110px] bg-white dark:bg-[#121212] ${selectedPaymentMethod === 'card'
                ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                : 'border-slate-200 dark:border-[#262626] hover:border-slate-400 text-slate-700 dark:text-slate-300'
              }`}
          >
            <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-[#181818] text-blue-500 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold leading-tight block text-slate-900 dark:text-white">
                Credit / Debit Card
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block">
                Powered by Stripe
              </span>
            </div>
          </div>

          {/* 2. PayPal */}
          <div
            onClick={() => setSelectedPaymentMethod('paypal')}
            className={`p-4 rounded-3xl cursor-pointer border transition-all flex flex-col items-center text-center justify-between min-h-[110px] bg-white dark:bg-[#121212] ${selectedPaymentMethod === 'paypal'
                ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-sm'
                : 'border-slate-200 dark:border-[#262626] hover:border-slate-400 text-slate-700 dark:text-slate-300'
              }`}
          >
            <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-[#181818] text-blue-600 flex items-center justify-center font-black text-lg font-serif">
              P
            </div>
            <div>
              <span className="text-xs font-bold leading-tight block text-slate-900 dark:text-white">
                PayPal
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block">
                Instant Transfer
              </span>
            </div>
          </div>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-[#181818] text-purple-500 flex items-center justify-center">
          <MoreHorizontal className="w-5 h-5" />
        </div>
        <span className="text-xs font-bold leading-tight mt-2 text-slate-900 dark:text-white">
          Other Methods
        </span>
      </div>
    </div>
      </div >

    { depositError && (
      <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{depositError}</span>
      </div>
    )
}

{/* Big Full-Width Teal Action Button (Matching Image 2 Screen 2) */ }
<button
  type="button"
  onClick={handleContinuePayment}
  disabled={depositLoading || getEffectiveAmount() <= 0}
  className="w-full py-4 rounded-2xl bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
>
  {depositLoading ? (
    <Loader2 className="w-5 h-5 animate-spin" />
  ) : (
    <>
      <Lock className="w-4 h-4" />
      <span>Continue to Payment</span>
      <ArrowRight className="w-4 h-4 ml-1" />
    </>
  )}
</button>

{/* Details Modal */ }
{
  showDetailsModal && selectedOffender && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#121212] w-full max-w-sm p-6 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-xl">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          Inmate Account Verification
        </h3>
        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
            <span>Full Name:</span>
            <strong className="text-slate-900 dark:text-white">{selectedOffender.name}</strong>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
            <span>Offender ID:</span>
            <strong className="font-mono text-teal-600 dark:text-teal-400">{selectedOffender.id}</strong>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
            <span>Assigned Unit:</span>
            <span>{selectedOffender.unit}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
            <span>Cell Housing:</span>
            <span>{selectedOffender.housing}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Max Single Deposit:</span>
            <span className="font-mono font-bold">${selectedOffender.maxDepositAmount.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={() => setShowDetailsModal(false)}
          className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold"
        >
          Close Details
        </button>
      </div>
    </div>
  )
}

{/* Checkout Simulator Modal */ }
{
  pendingIntent && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl space-y-5">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto mb-2">
            <Building className="w-6 h-6" />
          </div>
          <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 font-bold uppercase tracking-wider block">
            Electronic Deposit Checkout
          </span>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
            Authorize Deposit for {selectedOffender?.name}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
            Ref: {pendingIntent.providerRef}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626] text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Deposit Amount:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              ${pendingIntent.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Processing Fee:</span>
            <span className="font-mono text-slate-900 dark:text-white">
              ${pendingIntent.fee.toFixed(2)}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm">
            <span className="text-slate-800 dark:text-slate-200">Total Charged:</span>
            <span className="font-mono text-teal-600 dark:text-teal-400">
              ${pendingIntent.totalPaid.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirmPayment}
            disabled={depositLoading}
            className="btn-teal w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5"
          >
            {depositLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Confirm & Authorize</span>}
          </button>
          <button
            type="button"
            onClick={() => setPendingIntent(null)}
            className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-300 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

{/* Receipt Modal */ }
{
  receipt && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-xl text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Deposit Confirmed!
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Reference: <strong className="text-teal-600 dark:text-teal-400">{receipt.providerRef}</strong>
        </p>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626] text-left text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Beneficiary:</span>
            <span className="font-bold text-slate-900 dark:text-white">{receipt.offenderName} ({receipt.offenderId})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Credited to Account:</span>
            <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
              ${receipt.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Fee:</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">${receipt.fee.toFixed(2)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm">
            <span className="text-slate-800 dark:text-slate-200">Total Paid:</span>
            <span className="font-mono text-slate-900 dark:text-white">${receipt.totalPaid.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            onClick={() => setReceipt(null)}
            className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
    </div >
  );
}
