import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';

/**
 * ChangePasswordForm
 *
 * UI-ready change-password form. The backend Authentication API does NOT
 * expose a change-password endpoint yet (only register / login / refresh /
 * logout / logout-all), so submitting validates the input and reports
 * readiness — no API call, no Backend changes.
 *
 * When the backend ships POST /users/me/password (or similar), wire it in
 * the single marked spot below.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = 'Current password is required';
    if (!newPassword) {
      next.newPassword = 'New password is required';
    } else if (newPassword.length < 6) {
      // Matches backend RegisterRequest constraint (@Size(min = 6)).
      next.newPassword = 'Password must be at least 6 characters';
    }
    if (confirmPassword !== newPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInfo('');
    if (!validate()) return;

    setSaving(true);
    try {
      // TODO: wire to the backend change-password endpoint when it exists,
      // e.g. await apiClient.post('/users/me/password', { currentPassword, newPassword });
      await new Promise((r) => setTimeout(r, 400));
      setInfo(
        'Password change is ready — the backend does not expose a change-password endpoint yet.',
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setSaving(false);
    }
  }

  const type = showPasswords ? 'text' : 'password';
  const eyeToggle = (
    <button
      type="button"
      onClick={() => setShowPasswords((s) => !s)}
      className="hover:text-[#374151] transition-colors"
      aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
    >
      {showPasswords ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col space-y-4">
      <Input
        label="Current Password"
        type={type}
        placeholder="••••••••"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        error={errors.currentPassword}
        icon={<Icon.Lock className="w-4 h-4" />}
        suffix={eyeToggle}
      />
      <Input
        label="New Password"
        type={type}
        placeholder="••••••••"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        error={errors.newPassword}
        hint="At least 6 characters"
        icon={<Icon.Lock className="w-4 h-4" />}
      />
      <Input
        label="Confirm Password"
        type={type}
        placeholder="••••••••"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        icon={<Icon.Lock className="w-4 h-4" />}
      />

      {info && <Alert type="info" title="Ready" message={info} />}

      {/* Pinned to the card bottom when the card stretches taller. */}
      <div className="mt-auto pt-2">
        <Button type="submit" loading={saving} className="w-full">
          Save Password
        </Button>
      </div>
    </form>
  );
}
