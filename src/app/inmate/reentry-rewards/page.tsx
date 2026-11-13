'use client';

import React from 'react';
import Link from 'next/link';
import { Award, Sparkles, ArrowLeft, CheckCircle2, ShieldCheck, Heart } from 'lucide-react';

export default function ReentryRewardsPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <Link
        href="/inmate"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </Link>

      <div className="bg-white dark:bg-[#121212] p-8 sm:p-12 rounded-3xl border border-slate-200 dark:border-[#262626] text-center relative overflow-hidden shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mx-auto mb-4">
          <Award className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-500/30 text-teal-600 dark:text-teal-400 text-xs font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Coming Soon</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Reentry Rewards Program
        </h1>
        <p className="text-slate-600 dark:text-slate-300 text-xs sm:text-sm mt-2 max-w-md mx-auto leading-relaxed">
          Rewarding vocational milestone completion, educational attainment, and continued disciplinary good standing with exclusive commissary benefits.
        </p>

        {/* Feature Highlights Grid */}
        <div className="my-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <CheckCircle2 className="w-5 h-5 text-teal-500 mb-2" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tier Discounts</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Earn 5% - 15% discount credits on select commissary staples.</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <ShieldCheck className="w-5 h-5 text-teal-500 mb-2" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Higher Caps</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Increased weekly spending limits for positive program credits.</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <Heart className="w-5 h-5 text-teal-500 mb-2" />
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">Family Bonus</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Zero processing fees on family deposit matches.</p>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          Scheduled launch: Q1 2027 Facility Rollout &bull; Unit Education Department
        </p>
      </div>
    </div>
  );
}

