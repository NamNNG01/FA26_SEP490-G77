import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { passwordService, PASSWORD_MIN_LENGTH } from '@/services/password.service';
import { AuthPageHeader } from '../components/AuthPageHeader';

/**
 * ResetPasswordPage
 *
 * Backend: POST /api/v1/auth/password/reset { token, newPassword }
 *
 * The reset link carries the token as /reset-password?token=<token>. When the
 * page is opened without it (e.g. from "I have a reset code"), the user can
 * paste the code manually. A successful reset revokes every refresh token of
 * the account on the backend, so the user signs in again afterwards.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromLink = searchParams.get('token') ?? '';

  const [token, setToken] = useState(tokenFromLink);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColor = ['', '#DC2626', '#D97706', '#2563EB', '#16A34A'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Backend validation (from ResetPasswordRequest):
    if (!token.trim()) {
      setError('Reset token is required');
      return;
    }
    if (!password) {
      setError('New password is required');
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      setSuccessMessage(await passwordService.resetPassword(token, password));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div className="flex flex-col">
        <AuthPageHeader title="Password updated" subtitle="You can now sign in with your new password." />
        <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg text-center space-y-4">
          <div className="w-14 h-14 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto">
            <Icon.CheckCircle className="w-8 h-8 text-[#16A34A]" />
          </div>
          <p className="text-[13px] text-[#6B7280]">{successMessage}</p>
          <Button className="w-full" onClick={() => navigate(ROUTES.login, { replace: true })}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AuthPageHeader
        title="Set a new password"
        subtitle={`Must be at least ${PASSWORD_MIN_LENGTH} characters.`}
      />

      <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
        {error && <Alert type="error" title="Reset failed" message={error} />}

        <form onSubmit={handleSubmit} className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5">
          {!tokenFromLink && (
            <Input
              label="Reset code"
              placeholder="Paste the code from your email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              icon={<Icon.Mail className="w-4 h-4" />}
            />
          )}
          <Input
            label="New password"
            placeholder="Enter your new password"
            type={showPwd ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Icon.Lock className="w-4 h-4" />}
            suffix={
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="hover:text-[#374151] transition-colors"
              >
                {showPwd ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
              </button>
            }
          />
          {strength > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="flex-1 h-1.5 rounded-full transition-colors"
                    style={{ background: i <= strength ? strengthColor[strength] : '#F3F4F6' }}
                  />
                ))}
              </div>
              <p className="text-[12px] font-medium" style={{ color: strengthColor[strength] }}>
                {strengthLabel[strength]}
              </p>
            </div>
          )}
          <Input
            label="Confirm password"
            placeholder="Confirm your new password"
            type={showConfirm ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Icon.Lock className="w-4 h-4" />}
            suffix={
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                className="hover:text-[#374151] transition-colors"
              >
                {showConfirm ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Button className="w-full" loading={loading} type="submit">
            Set new password
          </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#F3F4F6] flex justify-center">
          <button
            type="button"
            onClick={() => navigate(ROUTES.login)}
            className="text-[13px] text-[#6B7280] hover:text-[#374151] flex items-center justify-center gap-1.5"
          >
            <Icon.ChevronLeft className="w-4 h-4" />
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
