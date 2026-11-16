'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'kiosk';
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'kiosk';
export type Orientation = 'portrait' | 'landscape';

export interface DeviceInfo {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  deviceType: DeviceType;
  orientation: Orientation;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isKiosk: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isTouch: boolean;
  isStandalone: boolean;
  hasMounted: boolean;
}

const defaultDeviceInfo: DeviceInfo = {
  width: 1280,
  height: 800,
  breakpoint: 'xl',
  deviceType: 'desktop',
  orientation: 'landscape',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isKiosk: false,
  isPortrait: false,
  isLandscape: true,
  isTouch: false,
  isStandalone: false,
  hasMounted: false,
};

const DeviceContext = createContext<DeviceInfo>(defaultDeviceInfo);

/**
 * SECURITY ARCHITECTURE MANDATE:
 * Device detection is purely an ergonomic, rendering, and layout helper.
 * NEVER treat DeviceContext values as an authentication, authorization, or role-gating mechanism.
 * All access permissions and security controls are strictly enforced server-side.
 */
export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(defaultDeviceInfo);

  useEffect(() => {
    function calculateDevice(): DeviceInfo {
      if (typeof window === 'undefined') {
        return defaultDeviceInfo;
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      const orientation: Orientation = h > w ? 'portrait' : 'landscape';

      // Check touch capability
      const isTouch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

      // Check PWA Standalone Mode (iOS or Android)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      // Determine Breakpoint
      let bp: Breakpoint = 'xs';
      if (w >= 1800) bp = 'kiosk';
      else if (w >= 1536) bp = '2xl';
      else if (w >= 1280) bp = 'xl';
      else if (w >= 1024) bp = 'lg';
      else if (w >= 768) bp = 'md';
      else if (w >= 640) bp = 'sm';

      // Determine Device Type
      let deviceType: DeviceType = 'desktop';
      if (w < 768) {
        deviceType = 'mobile';
      } else if (w < 1024) {
        deviceType = 'tablet';
      } else if (w >= 1800 && isTouch) {
        deviceType = 'kiosk';
      }

      return {
        width: w,
        height: h,
        breakpoint: bp,
        deviceType,
        orientation,
        isMobile: deviceType === 'mobile',
        isTablet: deviceType === 'tablet',
        isDesktop: deviceType === 'desktop' || (!isTouch && w >= 1024),
        isKiosk: deviceType === 'kiosk' || (w >= 1800 && isTouch),
        isPortrait: orientation === 'portrait',
        isLandscape: orientation === 'landscape',
        isTouch,
        isStandalone,
        hasMounted: true,
      };
    }

    setDeviceInfo(calculateDevice());

    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDeviceInfo(calculateDevice());
      }, 50);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  return <DeviceContext.Provider value={deviceInfo}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceInfo {
  return useContext(DeviceContext);
}

