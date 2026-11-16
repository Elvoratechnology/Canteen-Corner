'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Clock, LogOut, CheckCircle } from 'lucide-react';
import { useCart } from '@/context/CartContext';

interface KioskSessionWatcherProps {
  /** Total inactivity window in seconds before full expiration (Default: 15 mins = 900s) */
  inactivityTimeoutSeconds?: number;
  /** Warning countdown window in seconds (Default: 60s) */
  warningCountdownSeconds?: number;
}

/**
 * Server-Synchronized Kiosk Inactivity & Privacy Auto-Wipe Guard
 * 
 * SECURITY MANDATE:
 * - Warns user 60 seconds before session termination.
 * - Heartbeat renews server-side JWT session on active user interaction.
 * - On expiration, wipes in-memory cart, calls server /api/auth/me logout, and redirects to login.
 * - Completely prevents sensitive account information from remaining visible on shared terminals.
 */
export function KioskSessionWatcher({
  inactivityTimeoutSeconds = 15 * 60,
  warningCountdownSeconds = 60,
}: KioskSessionWatcherProps) {
  const router = useRouter();
  const { clearCart } = useCart();

  const [isWarningVisible, setIsWarningVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(warningCountdownSeconds);

  const lastActivityRef = useRef<number>(Date.now());
  const isExpiringRef = useRef<boolean>(false);

  // Terminate session and clear state
  const handleTerminateSession = useCallback(async (reason = 'timeout') => {
    if (isExpiringRef.current) return;
    isExpiringRef.current = true;

    try {
      // Invalidate session on server
      await fetch('/api/auth/me', { method: 'POST' });
    } catch (err) {
      console.error('Logout error during session timeout:', err);
    } finally {
      // Clear sensitive in-memory state
      clearCart();
      setIsWarningVisible(false);
      router.push(`/inmate/login?reason=${reason}`);
    }
  }, [clearCart, router]);

  // Heartbeat to server and reset local activity timer
  const handleStaySignedIn = useCallback(async () => {
    lastActivityRef.current = Date.now();
    setIsWarningVisible(false);
    setSecondsRemaining(warningCountdownSeconds);

    try {
      const res = await fetch('/api/auth/inmate/heartbeat', { method: 'POST' });
      if (!res.ok) {
        // If server reports session already expired, terminate immediately
        handleTerminateSession('expired');
      }
    } catch (err) {
      console.error('Heartbeat failure:', err);
    }
  }, [warningCountdownSeconds, handleTerminateSession]);

  // Track user activity across the document
  useEffect(() => {
    const handleUserInteraction = () => {
      // Only reset activity if warning modal is not currently blocking
      if (!isWarningVisible) {
        lastActivityRef.current = Date.now();
      }
    };

    const events = ['pointerdown', 'touchstart', 'keydown', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserInteraction, { passive: true }));

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastActivityRef.current) / 1000);
      const remainingUntilFullTimeout = inactivityTimeoutSeconds - elapsedSeconds;

      if (remainingUntilFullTimeout <= 0) {
        clearInterval(checkInterval);
        handleTerminateSession('timeout');
      } else if (remainingUntilFullTimeout <= warningCountdownSeconds) {
        setIsWarningVisible(true);
        setSecondsRemaining(remainingUntilFullTimeout);
      } else {
        setIsWarningVisible(false);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserInteraction));
      clearInterval(checkInterval);
    };
  }, [inactivityTimeoutSeconds, warningCountdownSeconds, isWarningVisible, handleTerminateSession]);

  if (!isWarningVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="bg-white dark:bg-[#121212] w-full max-w-md p-6 sm:p-8 rounded-3xl border-2 border-amber-500 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner animate-pulse">
          <AlertTriangle className="w-9 h-9" />
        </div>

        <div>
          <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">
            Institutional Terminal Inactivity Warning
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1">
            Session Expiring Soon
          </h2>
          <p className="text-xs text-slate-600 dark:text-neutral-300 mt-1 leading-relaxed">
            Due to facility security regulations, your terminal session will automatically end in:
          </p>
        </div>

        {/* Big Countdown Number */}
        <div className="py-3 px-6 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 inline-flex items-center gap-3">
          <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          <span className="font-mono text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400">
            {secondsRemaining}s
          </span>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-neutral-400">
          Touch &ldquo;Stay Signed In&rdquo; to keep your cart and continue shopping.
        </p>

        {/* Large Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={handleStaySignedIn}
            className="btn-teal w-full min-h-[56px] py-3.5 rounded-2xl text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shadow-lg hover:opacity-95 active:scale-[0.99] transition-all"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Stay Signed In</span>
          </button>

          <button
            type="button"
            onClick={() => handleTerminateSession('manual')}
            className="w-full min-h-[48px] py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit &amp; Log Out Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}

