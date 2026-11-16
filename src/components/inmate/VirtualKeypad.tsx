'use client';

import React from 'react';
import { Delete, XCircle, ArrowRight, User, Lock } from 'lucide-react';

interface VirtualKeypadProps {
  activeField: 'offenderId' | 'pin';
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onFieldChange: (field: 'offenderId' | 'pin') => void;
  onSubmit: () => void;
  loading?: boolean;
}

/**
 * High-Contrast Touchscreen Virtual Keypad for Correctional Terminals & Kiosks
 * 
 * DESIGN & SECURITY SPECIFICATIONS:
 * - Minimum touch target >= 56x56px for standing kiosk operation (WCAG 2.5.5 / 2.5.8).
 * - Instant in-memory entry; never writes or persists credentials to browser storage.
 * - Supports Offender ID letter prefixes and rapid PIN numeric entry.
 */
export function VirtualKeypad({
  activeField,
  onKeyPress,
  onBackspace,
  onClear,
  onFieldChange,
  onSubmit,
  loading = false,
}: VirtualKeypadProps) {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const commonPrefixes = ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'K'];

  return (
    <div className="w-full bg-slate-100 dark:bg-[#121212] p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-[#262626] shadow-sm space-y-3 select-none">
      {/* Active Field Selector Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-white dark:bg-[#181818] rounded-2xl border border-slate-200 dark:border-[#2a2a2a]">
        <button
          type="button"
          onClick={() => onFieldChange('offenderId')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            activeField === 'offenderId'
              ? 'bg-teal-500 text-white shadow-sm'
              : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Typing ID</span>
        </button>

        <button
          type="button"
          onClick={() => onFieldChange('pin')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            activeField === 'pin'
              ? 'bg-teal-500 text-white shadow-sm'
              : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Typing PIN</span>
        </button>
      </div>

      {/* ID Letter Prefix Row (Visible when typing Offender ID) */}
      {activeField === 'offenderId' && (
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-neutral-400 block px-1">
            Common ID Letter Prefixes
          </span>
          <div className="grid grid-cols-8 gap-1.5">
            {commonPrefixes.map((letter) => (
              <button
                key={letter}
                type="button"
                onClick={() => onKeyPress(letter)}
                className="min-h-[44px] rounded-xl bg-white dark:bg-[#181818] hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 border border-slate-200 dark:border-[#2a2a2a] text-slate-900 dark:text-white font-mono font-bold text-sm flex items-center justify-center active:scale-95 transition-all shadow-sm"
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3x4 Large Touch Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {digits.map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => onKeyPress(digit)}
            className="min-h-[56px] rounded-2xl bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono font-black text-xl sm:text-2xl flex items-center justify-center active:scale-95 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {digit}
          </button>
        ))}

        {/* Clear Action */}
        <button
          type="button"
          onClick={onClear}
          title="Clear Field"
          className="min-h-[56px] rounded-2xl bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
        >
          <XCircle className="w-5 h-5" />
          <span>Clear</span>
        </button>

        {/* Zero */}
        <button
          type="button"
          onClick={() => onKeyPress('0')}
          className="min-h-[56px] rounded-2xl bg-white dark:bg-[#181818] hover:bg-slate-50 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white font-mono font-black text-xl sm:text-2xl flex items-center justify-center active:scale-95 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          0
        </button>

        {/* Backspace */}
        <button
          type="button"
          onClick={onBackspace}
          title="Backspace"
          className="min-h-[56px] rounded-2xl bg-slate-200/80 dark:bg-[#222222] hover:bg-slate-300 dark:hover:bg-[#2a2a2a] border border-slate-300 dark:border-[#333333] text-slate-800 dark:text-white font-bold text-xs flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
        >
          <Delete className="w-5 h-5" />
          <span>Back</span>
        </button>
      </div>

      {/* Enter / Submit Button */}
      <button
        type="button"
        disabled={loading}
        onClick={onSubmit}
        className="btn-teal w-full min-h-[56px] py-3.5 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
      >
        <span>Sign In to Terminal</span>
        <ArrowRight className="w-5 h-5" />
      </button>
    </div>
  );
}

