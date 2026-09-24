import React from 'react';
import { ProfileCard } from '@/components/profile/ProfileCard';
import { ChangePasswordForm } from '@/components/profile/ChangePasswordForm';
import { SecurityCard } from '@/components/profile/SecurityCard';

/**
 * ProfilePage
 *
 * - Profile Information: ProfileCard (data from AuthContext).
 * - Change Password: ChangePasswordForm (UI-ready until the backend
 *   exposes an endpoint).
 * - Security: SecurityCard — Logout from All Devices.
 *
 * Equal-width two-column layout on lg+ (stacked on mobile); the right
 * column pairs Change Password with Security below it.
 */
export function ProfilePage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h2 className="text-[22px] font-bold text-[#111827]">My Profile</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Profile Information */}
        <ProfileCard />

        {/* Right column: Change Password + Security */}
        <div className="flex flex-col gap-6">
          <div className="card p-6 flex-1 flex flex-col">
            <h4 className="text-[16px] font-semibold text-[#111827] mb-4">
              Change Password
            </h4>
            <ChangePasswordForm />
          </div>

          <SecurityCard />
        </div>
      </div>
    </div>
  );
}
