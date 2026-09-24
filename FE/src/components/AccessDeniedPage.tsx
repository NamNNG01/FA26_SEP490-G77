import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';

/**
 * AccessDeniedPage
 *
 * Rendered when an authenticated user navigates to a page for which they
 * lack a required role. Shows the required role(s) and the current role so
 * reviewers can inspect the authorization flow while the whole application
 * stays inspectable from the menu.
 */
export function AccessDeniedPage({
  requiredRole,
  currentUserRole,
  onLogout,
}: {
  requiredRole: string[][];
  currentUserRole: string;
  onLogout: () => Promise<void>;
}) {
  const text = currentUserRole
    ? `You are logged in as ${currentUserRole}.`
    : 'You are logged in.';

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="card p-8 text-center">
          <div className="w-16 h-16 bg-[#FEE2E2] rounded-full flex items-center justify-center mx-auto mb-5">
            <Icon.Shield className="w-8 h-8 text-[#DC2626]" />
          </div>

          <h2 className="text-[26px] font-extrabold text-[#111827] mb-2">Access Denied</h2>
          <p className="text-[14px] text-[#6B7280] mb-6">{text}</p>

          <div className="space-y-3 mb-8 text-left">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#DC2626]" />
              <span className="text-[13px] text-[#6B7280]">Required Role</span>
              <span className="text-[13px] font-semibold text-[#111827]">
                {requiredRole.length === 1
                  ? requiredRole[0][0]
                  : requiredRole.map((r) => `"${r[0]}"`).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
              <span className="text-[13px] text-[#6B7280]">Current User Role</span>
              <span className="text-[13px] font-semibold text-[#111827]">
                {currentUserRole || '—'}{' '}
                {currentUserRole ? '(view-only)' : ''}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onLogout();
            }}
          >
            <Icon.ChevronLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
