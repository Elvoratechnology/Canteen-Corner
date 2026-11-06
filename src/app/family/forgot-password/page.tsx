'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch('/api/auth/family/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white flex flex-col justify-center items-center p-4 sm:p-6 relative transition-colors duration-200">
      <div className="w-full max-w-md mb-6 flex justify-between items-center">
        <Link
          href="/family/login"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400 hover:text-teal-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Sign In</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#121212] p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-[#262626] text-center shadow-sm">
        {submitted ? (
          <div>
            <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-teal-950/60 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-teal-400 mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Instructions Sent</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 mb-6">
              If an active family account matches <span className="text-teal-600 dark:text-teal-400 font-mono font-bold">{email}</span>, a secure password reset link has been dispatched.
            </p>
            <Link
              href="/family/login"
              className="btn-teal inline-flex items-center justify-center w-full py-2.5 rounded-2xl text-xs font-bold"
            >
              Return to Sign In
            </Link>
          </div>
        ) : (
          <div>
            <div className="flex flex-col items-center justify-center text-center mb-6">
              <CanteenCornerLogo size="lg" showTagline={true} />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-3">Reset Account Password</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enter your registered email address to receive password recovery instructions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-teal w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 mt-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Instructions...</span>
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
