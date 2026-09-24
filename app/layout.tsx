import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tetris vs Jev',
  description: 'A synchronized Tetris match between you and Jev.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
