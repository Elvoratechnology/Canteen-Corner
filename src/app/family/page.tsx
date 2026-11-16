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
  Loader2,
  Printer,
  Receipt,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';

interface OffenderSearchResult {
  id: string;
  name: string;
  facilityName: string;
  maxDepositAmount: number;
  giftPackagesEnabled?: boolean;
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
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // Initial selected beneficiary: null (empty state until family searches and selects an inmate)
  const [selectedOffender, setSelectedOffender] = useState<OffenderSearchResult | null>(null);

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
    setSearchFeedback(null);
    try {
      const res = await fetch(`/api/family/offenders/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok && data?.offenders && data.offenders.length > 0) {
        setSearchResults(data.offenders);
        setSearchFeedback(null);
      } else {
        setSearchResults([]);
        setSearchFeedback('No matching inmate records found for the search query.');
      }
    } catch (err) {
      console.error(err);
      setSearchFeedback('Search failed. Please try again.');
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

  const effectiveAmount = getEffectiveAmount();
  const feeAmount = effectiveAmount > 0 ? 3.50 : 0;
  const totalPayable = effectiveAmount > 0 ? effectiveAmount + feeAmount : 0;

  const handleContinuePayment = async () => {
    if (depositLoading) return;
    if (!selectedOffender) {
      setDepositError('Please select an inmate beneficiary first.');
      return;
    }
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
    if (depositLoading || !pendingIntent || !selectedOffender) return;

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

  const depositPresets = [20, 30, 50, 100, 150];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-28 md:pb-8">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/family"
          className="min-w-[44px] min-h-[44px] rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-teal-500 shadow-sm transition-colors touch-manipulation"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Deposit Funds
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Send trust fund deposits securely via Stripe & PayPal with real-time posting.
          </p>
        </div>
      </div>

      {/* Inmate Search Section */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
          Find or Switch Inmate Beneficiary
        </label>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Inmate ID or Name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-base sm:text-sm focus:outline-none focus:border-teal-500 transition-colors shadow-sm min-h-[44px]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="btn-teal px-5 py-2.5 rounded-2xl text-xs font-bold shrink-0 shadow-sm flex items-center justify-center gap-1.5 min-h-[44px] min-w-[80px] touch-manipulation disabled:opacity-50"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Search</span>}
          </button>
        </form>

        {searchFeedback && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 px-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{searchFeedback}</span>
          </p>
        )}

        {/* Search Results Drawer / List */}
        {searchResults.length > 0 && (
          <div className="bg-slate-50 dark:bg-[#141414] p-3.5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400 px-1">
              <span>Matching Inmates ({searchResults.length})</span>
              <button
                type="button"
                onClick={() => setSearchResults([])}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 min-h-[32px]"
              >
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {searchResults.map((offender) => {
                const isSelected = selectedOffender?.id === offender.id;
                return (
                  <div
                    key={offender.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-teal-50/50 dark:bg-teal-950/30 border-teal-500 ring-1 ring-teal-500'
                        : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-[#262626]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {offender.name}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        ID: {offender.id}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {offender.facilityName}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOffender(offender);
                        setSearchResults([]);
                      }}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 min-h-[44px] touch-manipulation transition-colors ${
                        isSelected
                          ? 'bg-teal-500 text-white cursor-default'
                          : 'bg-slate-100 dark:bg-[#202020] text-slate-800 dark:text-slate-200 hover:bg-teal-500 hover:text-white'
                      }`}
                    >
                      {isSelected ? 'Active' : 'Select'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Selected Beneficiary Card */}
      {selectedOffender ? (
        <div className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-sm font-bold text-lg">
              {selectedOffender.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                  {selectedOffender.name}
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                  <ShieldCheck className="w-3 h-3 text-teal-500" />
                  Approved Link
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                ID: {selectedOffender.id} &bull; {selectedOffender.facilityName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => setShowDetailsModal(true)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors min-h-[44px] touch-manipulation"
            >
              Facility Info
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-3xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>No inmate selected. Please search and select an inmate beneficiary above to continue.</span>
        </div>
      )}

      {/* Deposit Amount Selection */}
      <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Choose Deposit Amount
          </span>
          {selectedOffender && (
            <span className="text-[11px] text-slate-400 font-mono">
              Facility Limit: ${selectedOffender.maxDepositAmount.toFixed(2)}
            </span>
          )}
        </div>

        {/* Presets: $20, $30, $50, $100, $150 with >=44px touch targets */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {depositPresets.map((amt) => {
            const isSelected = selectedPreset === amt && !customAmount;
            return (
              <button
                key={amt}
                type="button"
                disabled={depositLoading}
                onClick={() => {
                  setSelectedPreset(amt);
                  setCustomAmount('');
                }}
                className={`py-3 px-2 rounded-2xl font-mono text-base font-bold border transition-all min-h-[48px] touch-manipulation active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? 'bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] border-teal-500 dark:border-[#00dfa2] shadow-sm ring-2 ring-teal-500/20'
                    : 'bg-slate-50 dark:bg-[#181818]/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-[#262626] hover:border-teal-500'
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
            Or Custom Amount
          </label>
          <div className="relative max-w-xs">
            <span className="absolute left-3.5 top-2.5 font-mono text-slate-400 font-bold">$</span>
            <input
              type="number"
              step="0.01"
              min="5"
              max={selectedOffender?.maxDepositAmount || 300}
              value={customAmount}
              disabled={depositLoading}
              onChange={(e) => {
                setCustomAmount(e.target.value);
                setSelectedPreset(null);
              }}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/60 border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono text-base focus:outline-none focus:border-teal-500 min-h-[44px]"
            />
          </div>
        </div>

        {/* Transparent Breakdown Card */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#181818]/50 border border-slate-200 dark:border-[#262626]/80 text-xs space-y-1.5">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Credited to Inmate Account:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              ${effectiveAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Electronic Processing Fee:</span>
            <span className="font-mono text-slate-900 dark:text-white">${feeAmount.toFixed(2)}</span>
          </div>
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm text-slate-900 dark:text-white">
            <span>Total Payable Amount:</span>
            <span className="font-mono text-teal-600 dark:text-teal-400">
              ${totalPayable.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Select Payment Method Grid */}
      <div className="space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
          Select Payment Method
        </span>

        <div className="grid grid-cols-2 gap-3">
          {/* Credit / Debit Card (Stripe) */}
          <button
            type="button"
            disabled={depositLoading}
            onClick={() => setSelectedPaymentMethod('card')}
            className={`p-4 rounded-3xl border transition-all flex flex-col items-center text-center justify-between min-h-[110px] touch-manipulation active:scale-[0.98] bg-white dark:bg-[#121212] ${
              selectedPaymentMethod === 'card'
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
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
                Powered by Stripe
              </span>
            </div>
          </button>

          {/* PayPal */}
          <button
            type="button"
            disabled={depositLoading}
            onClick={() => setSelectedPaymentMethod('paypal')}
            className={`p-4 rounded-3xl border transition-all flex flex-col items-center text-center justify-between min-h-[110px] touch-manipulation active:scale-[0.98] bg-white dark:bg-[#121212] ${
              selectedPaymentMethod === 'paypal'
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
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
                Instant Transfer
              </span>
            </div>
          </button>
        </div>
      </div>

      {depositError && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{depositError}</span>
        </div>
      )}

      {/* Desktop / Tablet Continue Button */}
      <div className="hidden md:block">
        <button
          type="button"
          onClick={handleContinuePayment}
          disabled={depositLoading || effectiveAmount <= 0 || !selectedOffender}
          className="w-full py-4 rounded-2xl bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50 min-h-[48px] touch-manipulation"
        >
          {depositLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Continue to Payment (${totalPayable.toFixed(2)})</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>
      </div>

      {/* Mobile Sticky Payment Action Bar (Floating above bottom navigation) */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 bg-white/95 dark:bg-[#0c0c0c]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#262626] p-3 shadow-lg pb-safe safe-bottom">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-slate-400 block truncate">
              {selectedOffender ? selectedOffender.name : 'Select Inmate'}
            </span>
            <div className="text-base font-black font-mono text-teal-600 dark:text-teal-400 leading-tight">
              ${totalPayable.toFixed(2)}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-none block">
              Inc. $3.50 fee
            </span>
          </div>

          <button
            type="button"
            onClick={handleContinuePayment}
            disabled={depositLoading || effectiveAmount <= 0 || !selectedOffender}
            className="btn-teal px-5 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md min-h-[44px] min-w-[130px] touch-manipulation disabled:opacity-50"
          >
            {depositLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Inmate Facility Details Modal */}
      {showDetailsModal && selectedOffender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-sm p-6 rounded-3xl border border-slate-200 dark:border-[#262626] space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#262626] pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Inmate Beneficiary Details
              </h3>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#181818] flex items-center justify-center text-slate-500 hover:text-black dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
                <span>Full Legal Name:</span>
                <strong className="text-slate-900 dark:text-white">{selectedOffender.name}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
                <span>Offender ID:</span>
                <strong className="font-mono text-teal-600 dark:text-teal-400">{selectedOffender.id}</strong>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
                <span>Assigned Facility:</span>
                <span className="text-right text-slate-900 dark:text-white font-medium">{selectedOffender.facilityName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-[#262626]">
                <span>Max Single Deposit:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">${selectedOffender.maxDepositAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Sponsor Link Status:</span>
                <span className="inline-flex items-center gap-1 font-bold text-teal-600 dark:text-teal-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Approved
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDetailsModal(false)}
              className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] touch-manipulation"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Checkout Authorization Modal */}
      {pendingIntent && (
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

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleConfirmPayment}
                disabled={depositLoading}
                className="btn-teal w-full py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation disabled:opacity-50"
              >
                {depositLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authorizing...</span>
                  </>
                ) : (
                  <span>Confirm & Authorize</span>
                )}
              </button>
              <button
                type="button"
                disabled={depositLoading}
                onClick={() => setPendingIntent(null)}
                className="px-5 py-3 rounded-2xl bg-slate-100 dark:bg-[#181818] text-slate-600 dark:text-slate-300 text-xs font-semibold min-h-[44px] touch-manipulation hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Receipt Modal */}
      {receipt && (
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
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {receipt.offenderName} ({receipt.offenderId})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Credited to Account:</span>
                <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                  ${receipt.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Processing Fee:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">${receipt.fee.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-sm">
                <span className="text-slate-800 dark:text-slate-200">Total Paid:</span>
                <span className="font-mono text-slate-900 dark:text-white">${receipt.totalPaid.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 min-h-[44px] touch-manipulation"
              >
                <Printer className="w-4 h-4" />
                <span>Print Receipt</span>
              </button>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="btn-teal w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] touch-manipulation"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
