import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';

import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Puerta Verde Admin',
  description: 'Panel de administración para verdulerías',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
