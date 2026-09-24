import React from 'react';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { AuthProvider } from '@/auth/authContext';
import { ToastHost } from '@/components/ui/ToastHost';
import { AppContent } from './AppContent';

/**
 * Application root.
 *
 * Provider order matters:
 *  - ThemeProvider: applies the persisted theme on first paint (works even
 *    while the auth session is being restored).
 *  - ToastHost: mounted above the router so toasts survive redirects.
 *  - AuthProvider: restores the session synchronously from storage.
 */
export default function App() {
  return (
    <ThemeProvider>
      <ToastHost>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastHost>
    </ThemeProvider>
  );
}
