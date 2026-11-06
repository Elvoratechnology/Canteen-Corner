'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, User, AlertCircle, HelpCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function InmateLoginPage() {
  const router = useRouter();
  const [offenderId, setOffenderId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/inmate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offenderId, pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to login');
      }

      router.push('/inmate');
    } catch (err: any) {
      setError(err.message || 'Login error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoFill = () => {
    setOffenderId('A1234567');
    setPin('1234');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white flex flex-col justify-center items-center p-4 sm:p-6 relative transition-colors duration-200">
      {/* Top Header with Return & Theme Toggle */}
      <div className="w-full max-w-md mb-6 flex justify-between items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-teal-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Select Portal</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white dark:bg-[#121212] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm">
        {/* Centered Brand Header */}
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <CanteenCornerLogo size="lg" showTagline={true} />
          <span className="mt-3 inline-block px-3 py-1 rounded-full bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626] text-xs font-semibold">
            Institutional Inmate Terminal
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
              htmlFor="offenderId"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider"
            >
              Offender ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="offenderId"
                type="text"
                autoComplete="off"
                required
                value={offenderId}
                onChange={(e) => setOffenderId(e.target.value.toUpperCase())}
                placeholder="e.g. A1234567"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono text-base uppercase focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="pin"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider"
            >
              PIN Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                required
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter 4-digit PIN"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono tracking-widest text-base focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-teal-500 dark:bg-[#00dfa2] text-white dark:text-[#042f2e] font-extrabold text-sm flex items-center justify-center gap-2 mt-2 shadow-sm hover:opacity-95 transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <span>Login to Commissary</span>
            )}
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[#262626] text-center">
          <button
            type="button"
            onClick={handleDemoFill}
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-semibold"
          >
            Fill Demo Account: John Smith (A1234567 / 1234)
          </button>
        </div>

        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-teal-500" />
            <span>Need help? Contact Unit Staff</span>
          </button>
        </div>
      </div>

      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-sm p-6 rounded-3xl border border-slate-200 dark:border-[#262626] text-center shadow-xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Offender Support
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              If your PIN is locked or forgotten, please inform your Unit Correctional Officer or Case Manager. Facility staff will verify your identity and reset your credentials.
            </p>
            <button
              onClick={() => setShowHelpModal(false)}
              className="btn-teal w-full py-2.5 rounded-xl text-xs font-semibold"
            >
              Close Notice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
