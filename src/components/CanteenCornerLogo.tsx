'use client';

import React from 'react';

interface LogoProps {
  className?: string;
  showTagline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function CanteenCornerLogo({
  className = '',
  showTagline = true,
  size = 'md',
}: LogoProps) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const iconSize = isSm ? 28 : isLg ? 48 : 38;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Custom Shopping Cart with Padlock Icon */}
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: iconSize, height: iconSize }}
      >
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full text-teal-500"
        >
          {/* Cart Wheels */}
          <circle cx="16" cy="40" r="3" fill="currentColor" />
          <circle cx="34" cy="40" r="3" fill="currentColor" />
          {/* Cart Handle & Basket */}
          <path
            d="M6 8H11L15 28C15.2 29 16 30 17.5 30H36.5C38 30 38.8 29 39.2 27.5L42 14H12.5"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Padlock inside cart */}
          <rect
            x="20.5"
            y="17"
            width="11"
            height="9"
            rx="2"
            fill="currentColor"
          />
          <path
            d="M23 17V14.5C23 13 24.3 11.8 26 11.8C27.7 11.8 29 13 29 14.5V17"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Keyhole dot */}
          <circle cx="26" cy="21" r="1.2" fill="#ffffff" />
        </svg>
      </div>

      {/* Brand Text */}
      <div className="leading-none">
        <div
          className={`font-black tracking-tight ${
            isSm
              ? 'text-base'
              : isLg
              ? 'text-2xl sm:text-3xl'
              : 'text-xl sm:text-2xl'
          }`}
        >
          <span className="text-slate-900 dark:text-white transition-colors">
            Canteen
          </span>{' '}
          <span className="text-teal-500 font-extrabold">Corner</span>
        </div>
        {showTagline && (
          <p
            className={`font-medium tracking-wide text-slate-500 dark:text-slate-400 mt-0.5 ${
              isSm ? 'text-[10px]' : 'text-xs'
            }`}
          >
            Inmate Online Canteen
          </p>
        )}
      </div>
    </div>
  );
}

