import React from 'react';
import type { UserResponse } from '@/auth/authContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import type { ProfileStat } from '../hooks/useProfileOverview';

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Student',
  COURSE_MANAGER: 'Course Manager',
  CONTENT_MANAGER: 'Course Manager',
  ADMIN: 'Admin',
};

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
 * Edit Profile button and 4 activity statistics.
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
  return (
    <div className="card p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Avatar name={user.fullName} src={user.avatarUrl ?? undefined} size="xl" color="#2563EB" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-[22px] font-bold text-[#111827] break-words min-w-0">{user.fullName}</h3>
            <Badge variant="info">{ROLE_LABELS[user.role] ?? user.role}</Badge>
          </div>
          <p className="text-[14px] text-[#374151] break-all mt-1">{user.email}</p>
          <p className="text-[13px] text-[#6B7280] mt-1">{memberDetails(user)}</p>
        </div>

        <Button
          variant="outline"
          icon={<Icon.Edit className="w-4 h-4" />}
          onClick={onEdit}
          disabled={editing}
          className="self-start"
        >
          Edit Profile
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsLoading
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-7 w-14 rounded bg-[#F3F4F6] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[#F3F4F6] animate-pulse" />
              </div>
            ))
          : stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-[22px] font-bold text-[#111827] leading-tight">{stat.value}</p>
                <p className="text-[12px] text-[#6B7280] mt-0.5">{stat.label}</p>
              </div>
            ))}
      </div>
    </div>
  );
}
