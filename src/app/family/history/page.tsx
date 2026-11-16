'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Loader2,
  CreditCard,
  Building,
  ArrowLeft,
  Copy,
  Check,
} from 'lucide-react';

interface DepositItem {
  id: string;
  providerRef: string;
  provider: 'STRIPE' | 'PAYPAL' | string;
  amount: number;
  fee: number;
  totalPaid: number;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  createdAt: string;
  offender: {
    id: string;
    name: string;
  };
}

export default function FamilyDepositHistoryPage() {
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/family/deposits')
      .then((res) => res.json())
      .then((data) => {
        if (data?.deposits) {
          setDeposits(data.deposits);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = (ref: string) => {
    navigator.clipboard?.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  const getStatusBadge = (status: DepositItem['status']) => {
    switch (status) {
      case 'SUCCEEDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
            <CheckCircle2 className="w-3 h-3 text-teal-500" />
            Confirmed
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  const getProviderBadge = (provider: string) => {
    const isPaypal = provider.toUpperCase() === 'PAYPAL';
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
          isPaypal
            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900'
            : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900'
        }`}
      >
        <CreditCard className="w-3 h-3" />
        <span>{isPaypal ? 'PayPal' : 'Stripe Card'}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/family"
            className="w-10 h-10 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-[#262626] flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-teal-500 shadow-sm transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Deposit History
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Complete audited record of electronic commissary deposits for linked inmates.
            </p>
          </div>
        </div>

        <Link
          href="/family"
          className="btn-teal inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold shadow-sm self-start sm:self-auto min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>New Deposit</span>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        </div>
      ) : deposits.length === 0 ? (
        <div className="bg-white dark:bg-[#121212] p-10 rounded-3xl text-center border border-slate-200 dark:border-[#262626] shadow-sm">
          <Receipt className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">No Deposits Recorded</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            You have not made any electronic commissary deposits yet.
          </p>
          <Link
            href="/family"
            className="btn-teal inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-bold min-h-[44px]"
          >
            Deposit Funds Now
          </Link>
        </div>
      ) : (
        <>
          {/* Complete Desktop Table Experience (hidden md:block) */}
          <div className="hidden md:block bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#262626] text-slate-500 uppercase text-[10px] tracking-wider font-semibold">
                    <th className="py-3 px-3">Date &amp; Time</th>
                    <th className="py-3 px-3">Reference ID</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-3">Beneficiary Inmate</th>
                    <th className="py-3 px-3 text-right">Credit Amount</th>
                    <th className="py-3 px-3 text-right">Fee</th>
                    <th className="py-3 px-3 text-right">Total Paid</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#262626]">
                  {deposits.map((dep) => {
                    const dateStr = new Date(dep.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <tr
                        key={dep.id}
                        className="hover:bg-slate-50 dark:hover:bg-[#181818] transition-colors"
                      >
                        <td className="py-3.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {dateStr}
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <span>{dep.providerRef}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(dep.providerRef)}
                              className="text-slate-400 hover:text-teal-500 transition-colors p-1"
                              title="Copy Reference"
                            >
                              {copiedRef === dep.providerRef ? (
                                <Check className="w-3.5 h-3.5 text-teal-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-3">
                          {getProviderBadge(dep.provider || 'STRIPE')}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="font-bold text-slate-900 dark:text-white block">
                            {dep.offender.name}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            ID: {dep.offender.id}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-teal-600 dark:text-teal-400 text-sm">
                          ${dep.amount.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-slate-500">
                          ${dep.fee.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white text-sm">
                          ${dep.totalPaid.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {getStatusBadge(dep.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Readable Mobile Cards Experience (md:hidden - No Horizontal Scrolling) */}
          <div className="md:hidden space-y-3">
            {deposits.map((dep) => {
              const dateStr = new Date(dep.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={dep.id}
                  className="bg-white dark:bg-[#121212] p-4 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm space-y-3"
                >
                  {/* Top Bar: Reference & Status */}
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-[#262626]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                        {dep.providerRef}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(dep.providerRef)}
                        className="text-slate-400 hover:text-teal-500 transition-colors shrink-0 p-1"
                        title="Copy Reference"
                      >
                        {copiedRef === dep.providerRef ? (
                          <Check className="w-3.5 h-3.5 text-teal-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <div className="shrink-0">{getStatusBadge(dep.status)}</div>
                  </div>

                  {/* Middle Info: Inmate & Date */}
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-semibold block">
                        Beneficiary
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white text-sm">
                        {dep.offender.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 block">
                        ID: {dep.offender.id}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-slate-500 text-[10px] uppercase font-semibold block">
                        Method &amp; Date
                      </span>
                      <div className="mt-0.5">{getProviderBadge(dep.provider || 'STRIPE')}</div>
                      <span className="text-[10px] font-mono text-slate-400 block mt-1">
                        {dateStr}
                      </span>
                    </div>
                  </div>

                  {/* Financial Breakdown Row */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#181818]/60 border border-slate-100 dark:border-[#262626] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Credited to Inmate</span>
                      <span className="font-mono font-black text-teal-600 dark:text-teal-400 text-base">
                        ${dep.amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">
                        Fee: ${dep.fee.toFixed(2)} &bull; Total Paid
                      </span>
                      <span className="font-mono font-black text-slate-900 dark:text-white text-base">
                        ${dep.totalPaid.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
