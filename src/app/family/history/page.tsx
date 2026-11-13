'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Receipt, CheckCircle2, Clock, AlertCircle, Plus, Loader2 } from 'lucide-react';

interface DepositItem {
  id: string;
  providerRef: string;
  amount: number;
  fee: number;
  totalPaid: number;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  createdAt: string;
  offender: {
    id: string;
    name: string;
    unit: string;
  };
}

export default function FamilyDepositHistoryPage() {
  const [deposits, setDeposits] = useState<DepositItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Deposit History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Complete record of electronic commissary deposits placed through Stripe and PayPal.
          </p>
        </div>

        <Link
          href="/family"
          className="btn-teal inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-sm self-start sm:self-auto"
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
            You have not made any commissary deposits yet.
          </p>
          <Link
            href="/family"
            className="btn-teal inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold"
          >
            Deposit Funds Now
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
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
                className="bg-white dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm hover:border-teal-500/40 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-base">
                      {dep.providerRef}
                    </span>
                    {getStatusBadge(dep.status)}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Beneficiary: <strong className="text-slate-900 dark:text-white">{dep.offender.name}</strong> ({dep.offender.id}) &bull; {dep.offender.unit}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                    {dateStr} &bull; Electronic Gateway
                  </div>
                </div>

                <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-[#262626]">
                  <div className="font-mono font-black text-teal-600 dark:text-teal-400 text-xl">
                    ${dep.amount.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fee: ${dep.fee.toFixed(2)} &bull; Total: ${dep.totalPaid.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
