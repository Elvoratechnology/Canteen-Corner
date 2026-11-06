'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  ShoppingBag,
  Clock,
  Wallet,
  Bell,
  Star,
  LogOut,
  User,
  Timer,
  ShoppingCart,
} from 'lucide-react';
import { CartProvider, useCart } from '@/context/CartContext';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

interface OffenderInfo {
  id: string;
  name: string;
  unit: string;
  housing: string;
  balance: number;
  weeklyLimit: number;
  availableSpending: number;
  unreadNotifications: number;
}

function InmateNavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems } = useCart();
  const [profile, setProfile] = useState<OffenderInfo | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(15 * 60);

  const isLoginPage = pathname === '/inmate/login';

  useEffect(() => {
    if (isLoginPage) return;

    fetch('/api/inmate/profile')
      .then((res) => {
        if (!res.ok) {
          router.push('/inmate/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.offender) {
          setProfile(data.offender);
        }
      })
      .catch(() => router.push('/inmate/login'));
  }, [pathname, isLoginPage, router]);

  useEffect(() => {
    if (isLoginPage) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoginPage]);

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    router.push('/inmate/login');
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const navLinks = [
    { href: '/inmate', label: 'Home', icon: Home },
    { href: '/inmate/catalog', label: 'Catalog', icon: ShoppingBag },
    {
      href: '/inmate/cart',
      label: 'Cart',
      icon: ShoppingCart,
      badge: totalItems > 0 ? totalItems : undefined,
    },
    { href: '/inmate/orders', label: 'Orders', icon: Clock },
    { href: '/inmate/balance', label: 'Balance', icon: Wallet },
    {
      href: '/inmate/messages',
      label: 'Messages',
      icon: Bell,
      badge:
        profile?.unreadNotifications && profile.unreadNotifications > 0
          ? profile.unreadNotifications
          : undefined,
    },
    { href: '/inmate/reentry-rewards', label: 'Rewards', icon: Star },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white flex flex-col md:flex-row pb-20 md:pb-0 transition-colors duration-200">
      {/* Sidebar for Tablet & Desktop (Matching Image 2 Screen 1) */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 border-r border-slate-200 dark:border-[#222222] bg-white dark:bg-[#0c0c0c] p-4 shrink-0 min-h-screen sticky top-0 h-screen justify-between z-30 transition-colors">
        <div>
          {/* Logo Header */}
          <div className="pb-5 border-b border-slate-200 dark:border-[#222222]">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

          {/* Navigation Links with solid active pill */}
          <nav className="mt-5 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-teal-500 text-white font-bold shadow-sm'
                      : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{link.label}</span>
                  </div>
                  {link.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-white text-teal-600'
                          : 'bg-red-500 text-white'
                      }`}
                    >
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Offender Profile Card & Logout */}
        <div className="pt-4 border-t border-slate-200 dark:border-[#222222] space-y-3">
          {/* Session timer pill */}
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#141414] text-[11px] text-slate-500 dark:text-neutral-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-teal-500" />
              <span>Session</span>
            </span>
            <span className="font-bold text-teal-600 dark:text-teal-400">
              {formatTimer(secondsRemaining)}
            </span>
          </div>

          {/* User Profile Pill */}
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {profile?.name || 'John Smith'}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">
                  {profile ? `${profile.unit} • ${profile.housing}` : 'Unit 4 • Cell Block B'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar for Mobile and Desktop with ThemeToggle */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-slate-200 dark:border-[#222222] px-4 sm:px-6 py-3 flex items-center justify-between transition-colors">
          <div className="md:hidden flex items-center gap-2">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

          <div className="hidden md:flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-neutral-400">
              Cumberland Regional Correctional Center &bull; Kiosk System Active
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/inmate/messages"
              className="relative p-2 rounded-xl bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 hover:text-teal-500 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {profile?.unreadNotifications && profile.unreadNotifications > 0 ? (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {profile.unreadNotifications}
                </span>
              ) : null}
            </Link>

            <button
              onClick={handleLogout}
              className="md:hidden p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0c0c0c]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#222222] safe-bottom">
        <div className="grid grid-cols-5 h-16 items-center px-1">
          <Link
            href="/inmate"
            className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
              pathname === '/inmate'
                ? 'text-teal-600 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Home</span>
          </Link>

          <Link
            href="/inmate/catalog"
            className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
              pathname === '/inmate/catalog'
                ? 'text-teal-600 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Catalog</span>
          </Link>

          <Link
            href="/inmate/cart"
            className={`relative flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
              pathname === '/inmate/cart'
                ? 'text-teal-600 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-teal-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium mt-1">Cart</span>
          </Link>

          <Link
            href="/inmate/orders"
            className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
              pathname === '/inmate/orders'
                ? 'text-teal-600 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Orders</span>
          </Link>

          <Link
            href="/inmate/balance"
            className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
              pathname === '/inmate/balance'
                ? 'text-teal-600 dark:text-teal-400 font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Balance</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

export default function InmateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CartProvider>
      <InmateNavShell>{children}</InmateNavShell>
    </CartProvider>
  );
}
