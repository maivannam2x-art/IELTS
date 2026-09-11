import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IELTS Vocabulary Trainer',
  description: 'Personal IELTS vocabulary trainer with flashcards, daily review and practice.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#111827',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
