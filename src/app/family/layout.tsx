'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  HeartHandshake,
  Search,
  Receipt,
  Gift,
  LogOut,
  User,
  CreditCard,
} from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  const isAuthPage =
    pathname.includes('/login') ||
    pathname.includes('/register') ||
    pathname.includes('/forgot-password');

  useEffect(() => {
    if (isAuthPage) return;

    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.push('/family/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
        }
      })
      .catch(() => router.push('/family/login'));
  }, [pathname, isAuthPage, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    router.push('/family/login');
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  const navLinks = [
    { href: '/family', label: 'Deposit Funds', icon: CreditCard },
    { href: '/family/history', label: 'Deposit History', icon: Receipt },
    { href: '/family/packages', label: 'Care Packages', icon: Gift },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white flex flex-col md:flex-row pb-20 md:pb-0 transition-colors duration-200">
      {/* Sidebar for Tablet & Desktop */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 border-r border-slate-200 dark:border-[#222222] bg-white dark:bg-[#0c0c0c] p-4 shrink-0 min-h-screen sticky top-0 h-screen justify-between z-30 transition-colors">
        <div>
          {/* Logo Header */}
          <div className="pb-5 border-b border-slate-200 dark:border-[#222222]">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

          {/* Navigation Links */}
          <nav className="mt-5 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-teal-500 text-white font-bold shadow-sm'
                      : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="pt-4 border-t border-slate-200 dark:border-[#222222] space-y-3">
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-teal-500/20 text-teal-500 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {user?.name || 'Sarah Smith'}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-neutral-400 truncate">
                  Family Sponsor
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
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-slate-200 dark:border-[#222222] px-4 sm:px-6 py-3 flex items-center justify-between transition-colors">
          <div className="md:hidden flex items-center gap-2">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

          <div className="hidden md:flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-neutral-400">
              Institutional Trust Fund Electronic Deposit Portal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="md:hidden p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0c0c0c]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#222222] safe-bottom">
        <div className="grid grid-cols-3 h-16 items-center px-2">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium transition-colors min-h-[44px] ${
                  isActive ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
