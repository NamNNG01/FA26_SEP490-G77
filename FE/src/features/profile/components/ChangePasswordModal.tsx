import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/authContext';
import { ROUTES } from '@/app/routes';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { passwordService, PASSWORD_MIN_LENGTH, PASSWORD_TOO_LONG_MESSAGE, isPasswordTooLong } from '@/services/password.service';

const PASSWORD_TIPS = [
  `Use at least ${PASSWORD_MIN_LENGTH} characters — longer passwords are harder to guess.`,
  'Mix uppercase and lowercase letters, numbers and symbols.',
  'Avoid personal details such as your name, birthday or email.',
  'Do not reuse a password you use on other websites.',
];

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;

/**
 * ChangePasswordModal
 *
 *  ┌ Change Password + description ─────────────────────────────────┐
 *  ├ Form: current / new / confirm  ──────┬ Password Tips sidebar ───┤
 *  │       [Update Password] [Cancel]     ├ Security Notice panel ───┤
 *  └──────────────────────────────────────┴──────────────────────────┘
 *
 * Submits PUT /auth/password/change. The backend revokes every refresh
 * token of the user on success, so the local session is closed and the
 * user is sent to the login page to sign in with the new password.
 */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  function resetFields() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswords(false);
    setErrors({});
    setSubmitError('');
  }

  function handleCancel() {
    if (saving) return;
    resetFields();
    onClose();
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!currentPassword) next.currentPassword = 'Current password is required';
    if (!newPassword) {
      next.newPassword = 'New password is required';
    } else if (newPassword.length < PASSWORD_MIN_LENGTH) {
      next.newPassword = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    } else if (isPasswordTooLong(newPassword)) {
      next.newPassword = PASSWORD_TOO_LONG_MESSAGE;
    } else if (newPassword === currentPassword) {
      next.newPassword = 'New password must be different from the current password';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your new password';
    } else if (confirmPassword !== newPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSubmitError('');
    if (!validate()) return;

    setSaving(true);
    try {
      await passwordService.changePassword(currentPassword, newPassword);
      resetFields();
      onClose();
      await logout();
      navigate(ROUTES.login, { replace: true });
      toast.success('Password changed successfully. Please sign in with your new password.');
    } catch (err: unknown) {
      // Stay on the profile page with the modal open so the user can retry.
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to change password. Please try again.';
      setSubmitError(message);
      toast.error(`Password not changed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  const type = showPasswords ? 'text' : 'password';
  const eyeToggle = (
    <button
      type="button"
      onClick={() => setShowPasswords((s) => !s)}
      className="hover:text-content-secondary transition-colors"
      aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
    >
      {showPasswords ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <Modal open={open} onClose={handleCancel} size="xl">
      <div className="flex items-start justify-between gap-4 pt-2">
        <div>
          <h3 className="text-xl font-bold text-content">Change Password</h3>
          <p className="text-sm text-content-soft mt-1">
            Enter your current password, then choose a new secure password. You will be signed out
            of all devices and need to sign in again with the new password.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          className="text-content-subtle hover:text-content-secondary transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <Icon.X className="w-5 h-5" />
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-5 pb-2">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="md:col-span-3 rounded-[14px] border border-line p-5 space-y-4"
        >
          <Input
            label="Current Password"
            type={type}
            autoComplete="current-password"
            placeholder="Enter your current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={errors.currentPassword}
            hint="We need your current password to confirm it's really you."
            icon={<Icon.Lock className="w-4 h-4" />}
            suffix={eyeToggle}
          />
          <Input
            label="New Password"
            type={type}
            autoComplete="new-password"
            placeholder="Enter a new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            icon={<Icon.Lock className="w-4 h-4" />}
          />
          <Input
            label="Confirm New Password"
            type={type}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            icon={<Icon.Lock className="w-4 h-4" />}
          />

          {submitError && <Alert type="error" title="Password not changed" message={submitError} />}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="submit" loading={saving} disabled={saving}>
              Update Password
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>

        <div className="md:col-span-2 flex flex-col gap-5">
          <section className="rounded-[14px] border border-line p-5">
            <h4 className="text-lg font-semibold text-content">Password Tips</h4>
            <ul className="mt-4 space-y-3.5">
              {PASSWORD_TIPS.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-sm text-content-secondary">
                  <Icon.CheckCircle className="w-4 h-4 text-brand-ink flex-shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[14px] border border-line p-5">
            <div className="flex items-center gap-2.5">
              <Icon.Shield className="w-4 h-4 text-warning flex-shrink-0" />
              <h4 className="text-lg font-semibold text-content">Security Notice</h4>
            </div>
            <p className="text-sm text-content-soft mt-2 leading-relaxed">
              Never share your password with anyone — our staff will never ask for it. Changing
              your password signs you out of every device for your protection.
            </p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
