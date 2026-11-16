'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Lock,
  User,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  Loader2,
  Keyboard,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { VirtualKeypad } from '@/components/inmate/VirtualKeypad';
import { useDevice } from '@/context/DeviceContext';

function InmateLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const device = useDevice();

  const [offenderId, setOffenderId] = useState('');
  const [pin, setPin] = useState('');
  const [activeField, setActiveField] = useState<'offenderId' | 'pin'>('offenderId');
  const [showKeypad, setShowKeypad] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeoutNotice, setTimeoutNotice] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Auto-enable virtual keypad on kiosk or mobile touchscreens once mounted
  useEffect(() => {
    if (device.hasMounted && (device.isTouch || device.isKiosk)) {
      setShowKeypad(true);
    }
  }, [device.hasMounted, device.isTouch, device.isKiosk]);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'timeout') {
      setTimeoutNotice(
        'Your previous terminal session expired due to inactivity. Your account has been securely logged out.'
      );
    } else if (reason === 'manual') {
      setTimeoutNotice('You have successfully signed out of the commissary terminal.');
    }
  }, [searchParams]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!offenderId.trim() || !pin.trim()) {
      setError('Please provide both Offender ID and PIN.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/inmate/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offenderId: offenderId.trim(), pin: pin.trim() }),
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

  // Virtual Keypad input handlers
  const handleKeypadPress = (char: string) => {
    setError(null);
    if (activeField === 'offenderId') {
      if (offenderId.length < 12) {
        setOffenderId((prev) => (prev + char).toUpperCase());
      }
    } else {
      if (pin.length < 8) {
        setPin((prev) => prev + char);
      }
    }
  };

  const handleKeypadBackspace = () => {
    setError(null);
    if (activeField === 'offenderId') {
      setOffenderId((prev) => prev.slice(0, -1));
    } else {
      setPin((prev) => prev.slice(0, -1));
    }
  };

  const handleKeypadClear = () => {
    setError(null);
    if (activeField === 'offenderId') {
      setOffenderId('');
    } else {
      setPin('');
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Top Header Bar */}
      <div className="mb-6 flex justify-between items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-teal-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Select Portal</span>
        </Link>
        <ThemeToggle />
      </div>

      {timeoutNotice && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
          <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium leading-relaxed">{timeoutNotice}</div>
        </div>
      )}

      {error && (
        <div className="mb-5 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-3 text-red-600 dark:text-red-300 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {/* Adaptive Layout: Side-by-Side on Desktop/Tablet, Stacked on Mobile */}
      <div className={`grid grid-cols-1 ${showKeypad ? 'lg:grid-cols-2' : ''} gap-6 items-start`}>
        {/* Credentials Form Card */}
        <div className="bg-white dark:bg-[#121212] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm space-y-5">
          <div className="flex flex-col items-center justify-center text-center">
            <CanteenCornerLogo size="lg" showTagline={true} />
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626] text-xs font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
              <span>Institutional Inmate Terminal</span>
            </div>
          </div>

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
                  onFocus={() => setActiveField('offenderId')}
                  onChange={(e) => setOffenderId(e.target.value.toUpperCase())}
                  placeholder="e.g. A1234567"
                  className={`w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border text-slate-900 dark:text-white font-mono text-base uppercase focus:outline-none transition-all ${activeField === 'offenderId'
                      ? 'border-teal-500 ring-2 ring-teal-500/20'
                      : 'border-slate-200 dark:border-[#262626]'
                    }`}
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
                  onFocus={() => setActiveField('pin')}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter 4-digit PIN"
                  className={`w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#181818] border text-slate-900 dark:text-white font-mono tracking-widest text-base focus:outline-none transition-all ${activeField === 'pin'
                      ? 'border-teal-500 ring-2 ring-teal-500/20'
                      : 'border-slate-200 dark:border-[#262626]'
                    }`}
                />
              </div>
            </div>

            {/* Toggle On-Screen Virtual Keypad */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowKeypad((prev) => !prev)}
                className="text-xs text-slate-600 dark:text-neutral-400 hover:text-teal-500 inline-flex items-center gap-1.5 font-semibold transition-colors py-1.5 min-h-[44px] touch-manipulation"
              >
                <Keyboard className="w-4 h-4 text-teal-500" />
                <span>{showKeypad ? 'Hide Virtual Keypad' : 'Use Touchscreen Keypad'}</span>
              </button>
            </div>

            {!showKeypad && (
              <button
                type="submit"
                disabled={loading}
                className="btn-teal w-full min-h-[50px] py-3 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 mt-2 shadow-sm hover:opacity-95 transition-all"
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
            )}
          </form>

          <div className="pt-2 text-center">
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

        {/* Dedicated Virtual Keypad Column */}
        {showKeypad && (
          <div className="w-full">
            <VirtualKeypad
              activeField={activeField}
              onFieldChange={setActiveField}
              onKeyPress={handleKeypadPress}
              onBackspace={handleKeypadBackspace}
              onClear={handleKeypadClear}
              onSubmit={handleSubmit}
              loading={loading}
            />
          </div>
        )}
      </div>

      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121212] w-full max-w-sm p-6 rounded-3xl border border-slate-200 dark:border-[#262626] text-center shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Offender Support Notice
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
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

export default function InmateLoginPage() {
  return (
    <div className="min-h-screen min-h-screen-dvh bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white flex flex-col justify-center items-center p-4 sm:p-6 relative transition-colors duration-200 pt-safe pb-safe">
      <Suspense fallback={<Loader2 className="w-8 h-8 text-teal-500 animate-spin" />}>
        <InmateLoginForm />
      </Suspense>
    </div>
  );
}
