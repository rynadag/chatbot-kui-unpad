// src/app/Admin/layout.tsx
import React from 'react';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Cukup render children saja, atau div wrapper jika perlu
    <>{children}</>
  );
}