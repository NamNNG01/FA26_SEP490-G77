import React from 'react';
import { AuthProvider } from '@/auth/authContext';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
