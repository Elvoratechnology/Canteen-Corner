'use client';

import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  Calendar,
  Clock,
  TrendingUp,
  Receipt,
  Loader2,
} from 'lucide-react';

interface LedgerItem {
  id: string;
  type: string;
  debit: number;
  credit: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  referenceId: string;
  date: string;
}

interface BalanceData {
  currentBalance: number;
  weeklyLimit: number;
  currentWeeklySpent: number;
  remainingLimit: number;
  availableSpending: number;
  lastDeposit: {
    amount: number;
    date: string;
    providerRef: string;
  } | null;
  ledgerEntries: LedgerItem[];
}

export default function AccountBalancePage() {
  const [data, setData] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inmate/balance')
      .then((res) => res.json())
      .then((resData) => {
        if (resData) setData(resData);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Failed to load balance information.</div>;
  }

  const lastDepositFormatted = data.lastDeposit
    ? new Date(data.lastDeposit.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No recent deposits';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Account Balance &amp; Trust Ledger
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Complete institutional ledger statement for your inmate commissary account.
        </p>
      </div>

      {/* Main Balance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Balance (Clean Neutral Light / Dark) */}
        <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Current Balance</span>
            <Wallet className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-mono font-black text-slate-900 dark:text-white mt-2">
            ${data.currentBalance.toFixed(2)}
          </div>
          <div className="text-[11px] text-teal-600 dark:text-teal-400 mt-1">
            Reconciled Trust Balance
          </div>
        </div>

        {/* Available Spending */}
        <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Available Spending</span>
            <TrendingUp className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-mono font-black text-teal-600 dark:text-teal-400 mt-2">
            ${data.availableSpending.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Weekly limit: ${data.weeklyLimit.toFixed(2)}
          </div>
        </div>

        {/* Last Deposit */}
        <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Last Deposit</span>
            <ArrowDownLeft className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-3xl font-mono font-black text-slate-900 dark:text-white mt-2">
            {data.lastDeposit ? `$${data.lastDeposit.amount.toFixed(2)}` : '$0.00'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-mono">
            <Calendar className="w-3 h-3 text-teal-500" />
            <span>{lastDepositFormatted}</span>
          </div>
        </div>

        {/* Remaining Weekly Limit */}
        <div className="bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Remaining Weekly</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-mono font-black text-slate-900 dark:text-white mt-2">
            ${data.remainingLimit.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Spent: ${data.currentWeeklySpent.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Double-Entry Trust Ledger Statement */}
      <div className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#262626]">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Trust Ledger Statement
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Audited &bull; Double-Entry
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-[#262626] text-slate-400 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3 text-right">Debit</th>
                <th className="py-2.5 px-3 text-right">Credit</th>
                <th className="py-2.5 px-3 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {data.ledgerEntries.map((entry) => {
                const date = new Date(entry.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
                return (
                  <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-mono whitespace-nowrap">
                      {date}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                      {entry.description}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                      {entry.referenceId}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-red-500">
                      {entry.debit > 0 ? `-$${entry.debit.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-teal-400">
                      {entry.credit > 0 ? `+$${entry.credit.toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                      ${entry.balanceAfter.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
