// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Ganti dengan font Anda
import './globals.css';

// 1. Impor ThemeProvider dan Toaster
import { ThemeProvider } from '@/app/Admin/theme-provider'; // Sesuaikan path jika perlu
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KUI Chatbot',
  description: 'Aplikasi Admin dan Chatbot',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          {children}
          
          {/* 2. Tambahkan Toaster di sini */}
          {/* Ini akan otomatis ganti tema (dark/light) */}
          <Toaster richColors theme='system' />

        </ThemeProvider>
      </body>
    </html>
  );
}