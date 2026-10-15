import React, { useEffect, useState } from 'react';
import { useAuth, type UserResponse } from '@/auth/authContext';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';
import { userService, FULL_NAME_MAX_LENGTH } from '@/services/user.service';

/**
 * Personal Information section.
 *
 * Read-only until the header's Edit Profile button turns `editing` on.
 * Save → PUT /users/me { fullName } and refreshes the signed-in user;
 * Cancel reverts the form to the saved values.
 *
 * Email is shown but stays read-only: USER-02 does not accept email changes
 * (UpdateProfileRequest only has fullName and avatarUrl).
 */
export function PersonalInfoCard({
  user,
  editing,
  onEditingChange,
}: {
  user: UserResponse;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const { updateUser } = useAuth();
  const [fullName, setFullName] = useState(user.fullName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fresh form whenever editing starts or the saved user changes.
  useEffect(() => {
    setFullName(user.fullName);
  }, [user.fullName, editing]);

  useEffect(() => {
    if (editing) {
      setError('');
      setSuccess('');
    }
  }, [editing]);

  const handleCancel = () => {
    setFullName(user.fullName);
    setError('');
    onEditingChange(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Backend validation (from UpdateProfileRequest) + users.full_name NOT NULL.
    const trimmed = fullName.trim();
    if (!trimmed) {
      setError('Full name is required');
      return;
    }
    if (trimmed.length > FULL_NAME_MAX_LENGTH) {
      setError(`Full name must not exceed ${FULL_NAME_MAX_LENGTH} characters`);
      return;
    }
    if (trimmed === user.fullName) {
      onEditingChange(false);
      return;
    }

    setSaving(true);
    try {
      updateUser(await userService.updateProfile({ fullName: trimmed }));
      setSuccess('Your profile has been updated.');
      onEditingChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-6 h-full flex flex-col">
      <h4 className="text-[16px] font-semibold text-[#111827] mb-5">Personal Information</h4>

      {error && <Alert type="error" title="Update failed" message={error} />}
      {success && <Alert type="success" message={success} />}

      <form onSubmit={handleSave} className="flex flex-col gap-4 flex-1">
        <Input
          label="Full Name"
          placeholder="Enter your full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          readOnly={!editing}
          maxLength={FULL_NAME_MAX_LENGTH}
          icon={<Icon.User className="w-4 h-4" />}
        />
        <Input
          label="Email"
          type="email"
          value={user.email}
          readOnly
          icon={<Icon.Mail className="w-4 h-4" />}
          hint={editing ? 'Email cannot be changed.' : undefined}
        />

        <div className="mt-auto pt-2 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={!editing || saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={!editing}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
