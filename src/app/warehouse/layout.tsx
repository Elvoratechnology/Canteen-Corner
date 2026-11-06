'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardList,
  Boxes,
  FileSpreadsheet,
  LogOut,
  User,
} from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

interface StaffProfile {
  id: string;
  name: string;
  email: string;
  staffId?: string;
  role: string;
}

export default function WarehouseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState<StaffProfile | null>(null);

  const isLoginPage = pathname === '/warehouse/login';

  useEffect(() => {
    if (isLoginPage) return;

    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) {
          router.push('/warehouse/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (
          data?.user &&
          ['WAREHOUSE_PICKER', 'WAREHOUSE_SUPERVISOR', 'ADMIN'].includes(data.user.role)
        ) {
          setStaff(data.user);
        } else {
          router.push('/warehouse/login');
        }
      })
      .catch(() => router.push('/warehouse/login'));
  }, [pathname, isLoginPage, router]);

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' });
    router.push('/warehouse/login');
  };

  if (isLoginPage) {
    return <>{children}</>;
  }

  const navLinks = [
    { href: '/warehouse', label: 'Orders Queue', icon: ClipboardList },
    { href: '/warehouse/inventory', label: 'Inventory & Shortages', icon: Boxes },
    { href: '/warehouse/manifests', label: 'Delivery Manifests', icon: FileSpreadsheet },
  ];

  const isSupervisor =
    staff?.role === 'WAREHOUSE_SUPERVISOR' || staff?.role === 'ADMIN';

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-slate-100 flex flex-col md:flex-row pb-20 md:pb-0 transition-colors duration-200">
      {/* Sidebar for Tablet & Desktop */}
      <aside className="hidden md:flex flex-col w-60 lg:w-64 border-r border-slate-200 dark:border-[#222222] bg-white dark:bg-[#0c0c0c] p-4 shrink-0 min-h-screen sticky top-0 h-screen justify-between z-30 transition-colors no-print">
        <div>
          <div className="pb-5 border-b border-slate-200 dark:border-[#222222]">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

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
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#181818]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Staff Profile Card & Logout */}
        <div className="pt-4 border-t border-slate-200 dark:border-[#222222] space-y-3">
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#262626]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center justify-center shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {staff?.name || 'Marcus Miller'}
                </h4>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {isSupervisor ? 'Supervisor' : 'Fulfillment Picker'} &bull; {staff?.staffId || 'STF-01'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out Shift</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-slate-200 dark:border-[#222222] px-4 sm:px-6 py-3 flex items-center justify-between transition-colors no-print">
          <div className="md:hidden flex items-center gap-2">
            <CanteenCornerLogo size="sm" showTagline={false} />
          </div>

          <div className="hidden md:flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Warehouse Fulfillment Station &bull; Orders &amp; Picking Desk
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="md:hidden p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full">
          {children}
        </main>
      </div>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0c0c0c]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#222222] safe-bottom no-print">
        <div className="grid grid-cols-3 h-16 items-center px-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center py-1 rounded-lg transition-colors min-h-[44px] ${
                  isActive ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
