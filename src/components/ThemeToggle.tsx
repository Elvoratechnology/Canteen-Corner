'use client';

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle Night and Light mode"
      title={`Switch to ${theme === 'dark' ? 'Light' : 'Night'} Mode`}
      className={`p-2 rounded-xl transition-all flex items-center justify-center min-h-[40px] min-w-[40px] border ${
        theme === 'dark'
          ? 'bg-slate-800/80 hover:bg-slate-700 text-teal-400 border-slate-700/80 shadow-sm'
          : 'bg-white hover:bg-slate-100 text-teal-600 border-slate-200 shadow-sm'
      } ${className}`}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-slate-700" />
      )}
    </button>
  );
}

