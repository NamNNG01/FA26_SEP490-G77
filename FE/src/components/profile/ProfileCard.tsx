import React, { useEffect, useState } from 'react';
import { useAuth } from '@/auth/authContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';

/**
 * ProfileCard
 *
 * Profile Information section. ALL data comes from AuthContext (the
 * authenticated user returned by the backend /auth/login response) —
 * nothing hardcoded.
 *
 * Layout:
 *  - Header: avatar left, name + role badge + email + status right,
 *    vertically centered.
 *  - Fields in ONE full-width column (no side-by-side inputs):
 *      Full Name (editable), Email / Role / Account Status (readonly).
 *  - 24px between sections (mt-6/pt-6), 16px between fields (gap-4).
 *
 * Note: the backend exposes no profile-update endpoint yet
 * (PUT /users/me is deferred per ARCHITECTURE.md), so Full Name is
 * editable locally but changes are not persisted.
 */
export function ProfileCard() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');

  // Keep the editable field in sync if the authenticated user changes.
  useEffect(() => {
    if (user) setFullName(user.fullName);
  }, [user]);

  if (!user) return null;

  const roleCode = user.role?.code ?? '—';
  const roleName = user.role?.name ?? roleCode;

  return (
    <div className="card p-6 h-full flex flex-col">
      {/* Header: avatar left, info right, vertically aligned */}
      <div className="flex items-center gap-4">
        <Avatar
          name={user.fullName}
          src={user.avatarUrl ?? undefined}
          size="xl"
          color="#2563EB"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-[20px] font-bold text-foreground truncate">
              {user.fullName}
            </h3>
            <Badge variant="info">{roleName}</Badge>
          </div>
          <p className="text-[14px] text-muted-foreground truncate mt-0.5">
            {user.email}
          </p>
          <p className="text-[12px] font-medium uppercase tracking-wide text-content-subtle mt-1">
            {user.status}
          </p>
        </div>
      </div>

      {/* Fields — single column, each full width */}
      <div className="mt-6 pt-6 border-t border-line flex flex-col gap-4 flex-1">
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={user.email}
          readOnly
          icon={<Icon.Mail className="w-4 h-4" />}
          hint="Email changes are not supported by the backend yet."
        />
        <Input label="Role" value={roleCode} readOnly />
      </div>
    </div>
  );
}
