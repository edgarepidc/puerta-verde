import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';

import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
});

const BRAND_TAGLINE = 'La frescura de la central a tu puerta';

export const metadata: Metadata = {
  title: 'Puerta Verde',
  description: BRAND_TAGLINE,
  icons: {
    icon: '/brand/icon.png',
    apple: '/brand/icon.png',
  },
  openGraph: {
    title: 'Puerta Verde',
    description: BRAND_TAGLINE,
    siteName: 'Puerta Verde',
    locale: 'es_MX',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Puerta Verde',
    description: BRAND_TAGLINE,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
