import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'meet.capytech.co.uk',
  description: 'Book a meeting with Capytech',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
