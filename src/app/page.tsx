'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck, Lock } from 'lucide-react';
import { CanteenCornerLogo } from '@/components/CanteenCornerLogo';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col justify-between relative overflow-hidden bg-[#f8fafc] dark:bg-black text-slate-900 dark:text-white transition-colors duration-200">
      {/* Background illustration for Light Mode and Dark Mode */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft subtle neutral shadows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-slate-200/40 dark:bg-neutral-900/30 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-24 w-80 h-80 bg-slate-200/30 dark:bg-neutral-900/30 rounded-full blur-3xl" />

        {/* Stylized facility watchtower silhouette on the right (matches Image 1) */}
        <div className="absolute right-4 md:right-12 top-12 md:top-16 opacity-15 dark:opacity-10 w-44 md:w-56 h-72 hidden sm:block">
          <svg viewBox="0 0 160 260" fill="currentColor" className="w-full h-full text-slate-700 dark:text-neutral-400">
            {/* Tower roof */}
            <path d="M80 15L35 60H125L80 15Z" />
            <rect x="77" y="5" width="6" height="12" />
            {/* Tower observation room & windows */}
            <rect x="42" y="60" width="76" height="40" rx="3" />
            <rect x="48" y="68" width="16" height="22" rx="2" fill="#f8fafc" className="dark:fill-black" />
            <rect x="72" y="68" width="16" height="22" rx="2" fill="#f8fafc" className="dark:fill-black" />
            <rect x="96" y="68" width="16" height="22" rx="2" fill="#f8fafc" className="dark:fill-black" />
            {/* Walkway railing */}
            <rect x="36" y="100" width="88" height="6" rx="2" />
            {/* Tower legs / pillars */}
            <rect x="50" y="106" width="10" height="150" />
            <rect x="100" y="106" width="10" height="150" />
            {/* Cross bracings */}
            <line x1="55" y1="120" x2="105" y2="170" stroke="currentColor" strokeWidth="3" />
            <line x1="105" y1="120" x2="55" y2="170" stroke="currentColor" strokeWidth="3" />
            <line x1="55" y1="170" x2="105" y2="220" stroke="currentColor" strokeWidth="3" />
            <line x1="105" y1="170" x2="55" y2="220" stroke="currentColor" strokeWidth="3" />
          </svg>
        </div>
      </div>

      {/* Top Header Bar */}
      <header className="max-w-4xl mx-auto w-full pt-6 px-4 sm:px-6 z-10 flex items-center justify-between">
        <div className="flex-1" />
        {/* Centered Brand Logo */}
        <div className="flex flex-col items-center justify-center text-center">
          <CanteenCornerLogo size="lg" showTagline={true} />
        </div>
        {/* Theme Toggle (Night & Light Mode) */}
        <div className="flex-1 flex justify-end">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content: Welcome & Portal Selector */}
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 my-auto py-6 sm:py-8 z-10">
        {/* Welcome Headline */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
            Welcome!
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base font-medium mt-1.5">
            Please select your portal to continue
          </p>
          {/* Centered Teal Bar */}
          <div className="w-14 h-1 bg-teal-500 rounded-full mx-auto mt-3" />
        </div>

        {/* 3 Portal Selection Cards (Matching Image 1) */}
        <div className="space-y-4">
          {/* 1. Inmate Portal */}
          <Link
            href="/inmate/login"
            className="group block bg-white dark:bg-[#121212] p-3.5 sm:p-4 rounded-3xl border border-slate-200/90 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500 transition-all"
          >
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Vibrant Royal Blue Squircle with Inmate Figure */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-10 h-10 sm:w-12 sm:h-12"
                >
                  {/* Visor / Inmate Cap */}
                  <path
                    d="M22 23C22 17 26 14 32 14C38 14 42 17 42 23H22Z"
                    fill="white"
                  />
                  <path
                    d="M20 23C20 22 25 21 32 21C39 21 44 22 44 23C44 25 39 26 32 26C25 26 20 25 20 23Z"
                    fill="white"
                  />
                  {/* Head */}
                  <circle cx="32" cy="27" r="7" fill="white" />
                  {/* Torso with striped collar & badge */}
                  <path
                    d="M17 50C17 41 23 37 32 37C41 37 47 41 47 50H17Z"
                    fill="white"
                  />
                  {/* Striped collar details */}
                  <path
                    d="M20 44H44M22 48H42"
                    stroke="#2563eb"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  {/* ID card badge pinned on chest */}
                  <rect
                    x="35"
                    y="41"
                    width="7"
                    height="6"
                    rx="1"
                    fill="#2563eb"
                  />
                </svg>
              </div>

              {/* Title & Description */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Inmate Portal
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  View products, check balance, and place orders.
                </p>
              </div>

              {/* Circular Action Button with Arrow */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-all">
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          {/* 2. Family & Friends Portal */}
          <Link
            href="/family/login"
            className="group block bg-white dark:bg-[#121212] p-3.5 sm:p-4 rounded-3xl border border-slate-200/90 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-emerald-400 dark:hover:border-teal-500 transition-all"
          >
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Vibrant Emerald / Teal Squircle with Two Friendly People */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-10 h-10 sm:w-12 sm:h-12"
                >
                  {/* Left Person Head & Body */}
                  <circle cx="25" cy="24" r="6.5" fill="white" />
                  <path
                    d="M14 48C14 40 19 36 25 36C31 36 36 40 36 48H14Z"
                    fill="white"
                  />
                  {/* Right Person Head & Body */}
                  <circle cx="41" cy="27" r="5.5" fill="white" />
                  <path
                    d="M32 48C32 42 36 39 41 39C46 39 50 42 50 48H32Z"
                    fill="white"
                  />
                </svg>
              </div>

              {/* Title & Description */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Family & Friends Portal
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Search for an inmate and add funds.
                </p>
              </div>

              {/* Circular Action Button with Arrow */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-teal-400 flex items-center justify-center shrink-0 group-hover:bg-teal-600 group-hover:text-white transition-all">
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>

          {/* 3. Warehouse Portal */}
          <Link
            href="/warehouse/login"
            className="group block bg-white dark:bg-[#121212] p-3.5 sm:p-4 rounded-3xl border border-slate-200/90 dark:border-[#262626] shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-orange-500 transition-all"
          >
            <div className="flex items-center gap-4 sm:gap-5">
              {/* Vibrant Warm Orange/Amber Squircle with Warehouse & Boxes */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                <svg
                  viewBox="0 0 64 64"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-10 h-10 sm:w-12 sm:h-12"
                >
                  {/* Warehouse roof */}
                  <path
                    d="M16 27L32 17L48 27V47H16V27Z"
                    stroke="white"
                    strokeWidth="3.2"
                    strokeLinejoin="round"
                  />
                  {/* Garage opening frame */}
                  <path
                    d="M23 47V33H41V47"
                    stroke="white"
                    strokeWidth="2.8"
                    strokeLinejoin="round"
                  />
                  {/* Stacked Cargo Boxes */}
                  <rect x="25" y="38" width="6" height="6" fill="white" />
                  <rect x="33" y="38" width="6" height="6" fill="white" />
                  <rect x="29" y="32" width="6" height="6" fill="white" />
                </svg>
              </div>

              {/* Title & Description */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Warehouse Portal
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Receive and process orders.
                </p>
              </div>

              {/* Circular Action Button with Arrow */}
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 group-hover:bg-orange-500 group-hover:text-white transition-all">
                <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </Link>
        </div>

        {/* Demo Credentials Quick-Select Pill */}
        <div className="mt-8 p-3 rounded-2xl bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] text-xs text-slate-600 dark:text-neutral-400 flex flex-wrap items-center justify-around gap-2 text-center">
          <span>
            Inmate: <strong className="text-slate-900 dark:text-white font-mono">A1234567</strong> (PIN: 1234)
          </span>
          <span className="text-slate-400 dark:text-neutral-600">&bull;</span>
          <span>
            Family: <strong className="text-slate-900 dark:text-white">family@canteen.local</strong>
          </span>
          <span className="text-slate-400 dark:text-neutral-600">&bull;</span>
          <span>
            Staff: <strong className="text-slate-900 dark:text-white">picker@canteen.local</strong>
          </span>
        </div>
      </div>

      {/* Bottom Footer Wave & Safe • Secure • Convenient Badge (Matching Image 1) */}
      <footer className="w-full relative z-10 pt-4">
        {/* Decorative Badge with Shield */}
        <div className="flex items-center justify-center gap-3 text-[11px] font-bold tracking-wider text-slate-500 dark:text-neutral-400 uppercase pb-4">
          <div className="w-12 sm:w-20 h-px bg-slate-300 dark:bg-neutral-800" />
          <span>Safe &bull; Secure</span>
          <div className="w-6 h-6 rounded-md bg-teal-500 text-white flex items-center justify-center shadow-sm">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <span>Convenient</span>
          <div className="w-12 sm:w-20 h-px bg-slate-300 dark:bg-neutral-800" />
        </div>

        {/* Bottom Curved Wave Layers (Neutral Light / Dark) */}
        <div className="w-full overflow-hidden leading-none">
          <svg
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            className="relative block w-full h-10 sm:h-14 text-slate-200/80 dark:text-[#121212]"
            fill="currentColor"
          >
            <path d="M0,0 C300,90 600,20 900,75 C1050,100 1150,50 1200,30 L1200,120 L0,120 Z" />
          </svg>
        </div>
      </footer>
    </main>
  );
}
