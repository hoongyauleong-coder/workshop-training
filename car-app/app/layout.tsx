import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CAR/PAR – Jabatan Pematuhan',
  description: 'Corrective action tracking and reminders',
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body>{children}</body>
    </html>
  );
}
