import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import type { UserResponse } from '@/auth/authContext';
import { ROUTES } from '@/app/routes';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { roleLabel } from '@/utils/permissions';
import type { ProfileStat } from '../hooks/useProfileOverview';
import { ChangePasswordModal } from './ChangePasswordModal';
import { LogoutAllDevicesButton } from './LogoutAllDevicesButton';

function memberDetails(user: UserResponse): string {
  const status = user.status ? user.status.charAt(0) + user.status.slice(1).toLowerCase() : '';
  if (!user.createdAt) return status;
  const since = new Date(user.createdAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return status ? `Member since ${since} · ${status}` : `Member since ${since}`;
}

/**
 * User Header Card: avatar, full name, email, member details, role badge,
 * account actions (Edit Profile, Change Password modal — or Set Password for a
 * Google-only account — and Logout All Devices)
 * and 4 activity statistics.
 */
export function ProfileHeaderCard({
  user,
  stats,
  statsLoading,
  editing,
  onEdit,
}: {
  user: UserResponse;
  stats: ProfileStat[];
  statsLoading: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const navigate = useNavigate();
  // A Google-only account (AUTH-09) has no current password to confirm, so it
  // sets one through the Forgot password email instead. Older responses
  // without the flag keep Change Password.
  const canChangePassword = user.hasPassword !== false;

  return (
    <div className="card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Avatar name={user.fullName} src={user.avatarUrl ?? undefined} size="xl" color="#0D7C6C" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-xl font-bold text-content break-words min-w-0">{user.fullName}</h3>
            <Badge variant="info">{roleLabel(user.role)}</Badge>
          </div>
          <p className="text-base text-content-secondary break-all mt-1">{user.email}</p>
          <p className="text-sm text-content-soft mt-1">{memberDetails(user)}</p>
        </div>

        <div className="flex flex-col gap-2 self-start sm:w-auto w-full">
          <Button
            variant="outline"
            icon={<Icon.Edit className="w-4 h-4" />}
            onClick={onEdit}
            disabled={editing}
            className="w-full"
          >
            Edit Profile
          </Button>
          {canChangePassword ? (
            <Button
              variant="outline"
              icon={<Icon.Lock className="w-4 h-4" />}
              onClick={() => setPasswordOpen(true)}
              className="w-full"
            >
              Change Password
            </Button>
          ) : (
            <Button
              variant="outline"
              icon={<Icon.Lock className="w-4 h-4" />}
              onClick={() => navigate(ROUTES.forgotPassword, { state: { email: user.email } })}
              title="You sign in with Google. We'll email you a link to set a password."
              className="w-full"
            >
              Set Password
            </Button>
          )}
          <LogoutAllDevicesButton className="w-full" />
        </div>
      </div>

      {canChangePassword && (
        <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      )}

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsLoading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-7 w-14 rounded bg-surface-muted animate-pulse" />
                <div className="h-3 w-24 rounded bg-surface-muted animate-pulse" />
              </div>
            ))
          : stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-xl font-bold text-content leading-tight">{stat.value}</p>
                <p className="text-xs text-content-soft mt-0.5">{stat.label}</p>
              </div>
            ))}
      </div>
    </div>
  );
}
