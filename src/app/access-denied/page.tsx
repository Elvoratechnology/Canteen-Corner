'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, ArrowLeft, LogOut, Lock } from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

function AccessDeniedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const attemptedRole = searchParams.get('required') || '';
  const attemptedFrom = searchParams.get('from') || '';

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          setSessionRole(null);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.session) {
          setSessionRole(data.session.role);
          setUserName(data.session.name);
        } else {
          setSessionRole(null);
        }
      })
      .catch(() => setSessionRole(null))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    router.push('/');
  };

  const getAuthorizedPortalHref = () => {
    switch (sessionRole) {
      case 'ADMIN':
        return '/admin';
      case 'WAREHOUSE_PICKER':
      case 'WAREHOUSE_SUPERVISOR':
        return '/warehouse';
      case 'INMATE':
        return '/inmate';
      case 'FAMILY':
        return '/family';
      default:
        return '/';
    }
  };

  const getAuthorizedPortalLabel = () => {
    switch (sessionRole) {
      case 'ADMIN':
        return 'Return to Administrator Console';
      case 'WAREHOUSE_PICKER':
      case 'WAREHOUSE_SUPERVISOR':
        return 'Return to Warehouse Operations';
      case 'INMATE':
        return 'Return to Inmate Commissary';
      case 'FAMILY':
        return 'Return to Family Portal';
      default:
        return 'Return to Portal Selection';
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 transition-colors duration-200">
      <div className="w-full max-w-md mb-6 flex justify-between items-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Home</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-[#111111] border border-red-200 dark:border-red-900/50 rounded-2xl shadow-xl p-6 sm:p-8 text-center transition-colors">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-900/50">
          <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          403 — Access Denied
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-2">
          Your account does not have permission to access the requested portal or resource.
        </p>

        {attemptedFrom && (
          <div className="mt-3 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1a1a1a] text-[11px] font-mono text-slate-600 dark:text-slate-400">
            Attempted Route: <span className="text-red-600 dark:text-red-400 font-semibold">{attemptedFrom}</span>
          </div>
        )}

        <div className="mt-6 p-4 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626] text-left text-xs space-y-1.5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Current Identity:</span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {loading ? 'Checking...' : userName || 'Authenticated User'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span>Session Role:</span>
            <span className="font-bold font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {loading ? '...' : sessionRole || 'NONE'}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-[#2a2a2a]">
            <span>Account Isolation:</span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Strictly Enforced</span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href={getAuthorizedPortalHref()}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-semibold text-xs transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{getAuthorizedPortalLabel()}</span>
          </Link>

          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 rounded-xl border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 font-semibold text-xs transition-colors flex items-center justify-center gap-2 min-h-[44px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Current Account</span>
          </button>
        </div>
      </div>

      <div className="mt-6 text-center">
        <CanteenCornerLogo size="sm" showTagline={false} />
        <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1">
          Role-Based Access Control & Institutional Account Isolation
        </p>
      </div>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafc] dark:bg-black flex items-center justify-center p-4">
          <div className="text-xs text-slate-500 animate-pulse">Loading access control...</div>
        </div>
      }
    >
      <AccessDeniedContent />
    </React.Suspense>
  );
}


