'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Calendar,
  Wallet,
  ShoppingCart,
  ClipboardList,
  Gift,
  ArrowRight,
  Megaphone,
  Loader2,
} from 'lucide-react';

interface InmateProfile {
  id: string;
  name: string;
  unit: string;
  housing: string;
  balance: number;
  weeklyLimit: number;
  currentWeeklySpent: number;
  remainingWeeklyLimit: number;
  availableSpending: number;
  nextDeliveryDate: string;
  unreadNotifications: number;
}

export default function InmateDashboard() {
  const [profile, setProfile] = useState<InmateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch('/api/inmate/profile', { signal: controller.signal })
      .then(async (res) => {
        clearTimeout(timer);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data?.offender) {
          setProfile(data.offender);
        } else {
          throw new Error('No profile data received');
        }
      })
      .catch((err) => {
        console.error('InmateDashboard loadProfile error:', err);
        setError(err.name === 'AbortError' ? 'Connection timed out. Please check your network and retry.' : (err.message || 'Failed to load profile.'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        <span className="text-xs text-slate-500 dark:text-slate-400">Loading dashboard...</span>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8 rounded-3xl bg-white dark:bg-[#121212] border border-red-200 dark:border-red-900/50 text-center max-w-md mx-auto my-12 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-500 flex items-center justify-center mx-auto mb-3 font-bold text-lg">
          !
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
          {error || 'Unable to Load Profile'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Please check your connection or sign in again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            Retry
          </button>
          <Link
            href="/inmate/login"
            className="px-4 py-2 bg-slate-100 dark:bg-[#181818] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  const deliveryFormatted = new Date(profile.nextDeliveryDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Top Greeting & Account Overview (Matching Image 2 Screen 1) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <span className="text-base sm:text-lg text-slate-600 dark:text-slate-300 font-medium block">
            Welcome back,
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-teal-500 tracking-tight">
            {profile.name}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Here&apos;s your account overview.
          </p>
        </div>

        {/* Current Balance Card (Clean neutral Light / Dark, no green background) */}
        <div className="bg-white dark:bg-[#121212] p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-[#262626] flex items-center justify-between gap-6 shadow-sm">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 tracking-wider block">
              Current Balance
            </span>
            <div className="text-3xl sm:text-4xl font-black font-mono text-slate-900 dark:text-white mt-1">
              ${profile.balance.toFixed(2)}
            </div>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium mt-0.5 block">
              Available to spend: ${profile.availableSpending.toFixed(2)}
            </span>
          </div>

          <div className="w-14 h-14 rounded-2xl bg-teal-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Wallet className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Facility Limits Row (Weekly Limit & Next Delivery Date pills) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Weekly Limit Pill */}
        <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#262626] flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
              Weekly Limit
            </span>
            <strong className="text-sm font-bold text-slate-900 dark:text-white">
              ${profile.weeklyLimit.toFixed(2)}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                (Remaining: ${profile.remainingWeeklyLimit.toFixed(2)})
              </span>
            </strong>
          </div>
        </div>

        {/* Next Delivery Date Pill */}
        <div className="bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#262626] flex items-center gap-3 shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-teal-500" />
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">
              Next Scheduled Delivery
            </span>
            <strong className="text-sm font-bold text-slate-900 dark:text-white">
              {deliveryFormatted}{' '}
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                &bull; 14:00 Distribution
              </span>
            </strong>
          </div>
        </div>
      </div>

      {/* 4 Quick Access Action Cards (Matching Image 2 Screen 1 exactly!) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 1. Browse Products (Teal Cart) */}
        <Link
          href="/inmate/catalog"
          className="group bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-teal-400 dark:hover:border-teal-500 transition-all flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-white flex items-center justify-center shadow-md mb-3 group-hover:scale-105 transition-transform">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Browse Products
          </h3>
          <div className="mt-2 text-teal-600 dark:text-teal-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            <span>Shop Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        {/* 2. View Orders (Blue Clipboard) */}
        <Link
          href="/inmate/orders"
          className="group bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shadow-md mb-3 group-hover:scale-105 transition-transform">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            View Orders
          </h3>
          <div className="mt-2 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            <span>Past Orders</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        {/* 3. Check Balance (Purple Wallet) */}
        <Link
          href="/inmate/balance"
          className="group bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-purple-400 dark:hover:border-purple-500 transition-all flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-md mb-3 group-hover:scale-105 transition-transform">
            <Wallet className="w-8 h-8" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Check Balance
          </h3>
          <div className="mt-2 text-purple-600 dark:text-purple-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            <span>View Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>

        {/* 4. Rewards (Orange Gift Box) */}
        <Link
          href="/inmate/reentry-rewards"
          className="group bg-white dark:bg-[#121212] p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-orange-400 dark:hover:border-orange-500 transition-all flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md mb-3 group-hover:scale-105 transition-transform">
            <Gift className="w-8 h-8" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Rewards
          </h3>
          <div className="mt-2 text-orange-600 dark:text-orange-400 text-xs font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
            <span>Earn Benefits</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </Link>
      </div>

      {/* Bottom Announcement Banner (Clean Neutral Light / Dark) */}
      <Link
        href="/inmate/messages"
        className="block bg-white dark:bg-[#121212] p-4 rounded-2xl border border-slate-200 dark:border-[#262626] hover:border-slate-300 dark:hover:border-slate-700 shadow-sm transition-all"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                You have {profile.unreadNotifications > 0 ? profile.unreadNotifications : 1} new message.
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Institutional commissary delivery schedules & deposit confirmations.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 shrink-0">
            <span>View Message</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </Link>
    </div>
  );
}
