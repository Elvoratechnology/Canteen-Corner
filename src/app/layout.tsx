import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegister } from '@/components/PwaRegister';
import { ThemeProvider } from '@/context/ThemeContext';
import { DeviceProvider } from '@/context/DeviceContext';

export const metadata: Metadata = {
  title: 'Canteen Corner | Inmate Online Canteen',
  description: 'Inmate Online Canteen & Commissary Management Platform. Providing Essentials. Promoting Success.',
  manifest: '/manifest.json',
  applicationName: 'Canteen Corner',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Canteen Corner',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-192.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

/**
 * Responsive & Accessible Viewport Configuration:
 * - Preserves user accessibility and browser zoom (WCAG 1.4.4 - no maximum-scale or user-scalable restriction).
 * - Enables viewport-fit=cover for edge-to-edge rendering and safe-area compatibility on iPhone.
 * - Dynamic theme color switching based on light/dark mode preference.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#14b8a6' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen min-h-screen-dvh selection:bg-teal-500 selection:text-white no-horizontal-overflow">
        <ThemeProvider>
          <DeviceProvider>
            <PwaRegister />
            {children}
          </DeviceProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
