import React from 'react';
import { Outlet } from 'react-router';
import { PublicNavbar } from '@/features/landing/components/PublicNavbar';
import { PublicFooter } from '@/features/landing/components/PublicFooter';

/**
 * PublicLayout
 *
 * The guest-facing shell — header / main / footer — mounted for the public
 * routes (/, /courses, /courses/:slug, /pricing, /exams) for BOTH guests and
 * signed-in users. Public pages never render the application sidebar; the
 * authenticated workspace keeps its own DashboardLayout chrome.
 *
 * Scroll behavior: the app root sets `html, body, #root { overflow: hidden }`,
 * so this layout owns the scroll container for the whole public document.
 * `overflow-x-hidden` guarantees no horizontal scrolling.
 */
export function PublicLayout() {
  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-[#111827]">
      <PublicNavbar />

      <main>
        <Outlet />
      </main>

      <PublicFooter />
    </div>
  );
}