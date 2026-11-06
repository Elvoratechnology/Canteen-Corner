'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Lock,
  AlertCircle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function WarehouseLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/warehouse/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      router.push('/warehouse');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const fillPicker = () => {
    setIdentifier('STF-01');
    setPassword('Staff123!');
    setError(null);
  };

  const fillSupervisor = () => {
    setIdentifier('STF-02');
    setPassword('Staff123!');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative transition-colors duration-200">
      <div className="w-full max-w-md mb-6 flex justify-between items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-teal-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Portals</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#121212] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <CanteenCornerLogo size="lg" showTagline={true} />
          <span className="mt-3 inline-block px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900/40 text-xs font-semibold">
            Warehouse Fulfillment Desk
          </span>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-red-600 dark:text-red-300 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="identifier"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider"
            >
              Staff ID or Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="identifier"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. STF-01 or picker@canteen.local"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono text-base focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider"
            >
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white text-base focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-teal-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 mt-2 shadow-sm hover:bg-teal-600 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In to Warehouse</span>
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[#222222] flex flex-col sm:flex-row items-center justify-center gap-3 text-xs">
          <button
            type="button"
            onClick={fillPicker}
            className="text-teal-600 dark:text-teal-400 hover:underline font-semibold"
          >
            Demo Picker (STF-01)
          </button>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">&bull;</span>
          <button
            type="button"
            onClick={fillSupervisor}
            className="text-teal-600 dark:text-teal-400 hover:underline font-semibold"
          >
            Demo Supervisor (STF-02)
          </button>
        </div>
      </div>
    </div>
  );
}
