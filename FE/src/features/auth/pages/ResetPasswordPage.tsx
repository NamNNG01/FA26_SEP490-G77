import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { useAuth } from '@/auth/authContext';
import { passwordService, PASSWORD_MIN_LENGTH } from '@/services/password.service';
import { AuthPageHeader } from '../components/AuthPageHeader';

/**
 * Accepts either the raw token or the whole link from the email
 * (".../reset-password?token=abc") and returns the token.
 */
function extractResetToken(input: string): string {
  const value = input.trim();
  const match = value.match(/[?&]token=([^&#\s]+)/);
  if (!match) return value;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * ResetPasswordPage
 *
 * Backend: POST /api/v1/auth/password/reset { token, newPassword }
 *
 * The email sent by /auth/password/forgot links to
 * /reset-password?token=<token>. The token is read once and stripped from the
 * address bar so it does not linger in history or leak via Referer. When the
 * page is opened without it, the user can paste the link (or the token).
 *
 * A successful reset revokes every session of the account on the backend
 * (refresh tokens and older access tokens), so a signed-in user is signed out
 * locally too and everyone lands on Login with a confirmation banner.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tokenFromLink] = useState(() => searchParams.get('token') ?? '');

  useEffect(() => {
    if (searchParams.has('token')) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [token, setToken] = useState(tokenFromLink);
  const [linkInvalid, setLinkInvalid] = useState(false);
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
    setLinkInvalid(false);

    // Backend validation (from ResetPasswordRequest):
    const resetToken = extractResetToken(token);
    if (!resetToken) {
      setError('Reset link is required');
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
      setSuccessMessage(await passwordService.resetPassword(resetToken, password));
    } catch (err: unknown) {
      // 401 = unknown, used or expired token → offer a fresh link.
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setLinkInvalid(true);
      }
      setError(err instanceof Error ? err.message : 'Could not reset your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = async () => {
    // The backend already revoked this account's sessions; drop ours too.
    if (isAuthenticated) {
      await logout();
    }
    navigate(ROUTES.login, { replace: true, state: { passwordReset: true } });
  };

  if (successMessage) {
    return (
      <div className="flex flex-col">
        <AuthPageHeader
          icon={<Icon.CheckCircle className="w-7 h-7" />}
          title="Password updated"
          subtitle="You can now sign in with your new password."
        />
        <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg text-center space-y-4">
          <p className="text-[13px] text-[#6B7280]">{successMessage}</p>
          <Button className="w-full" onClick={goToLogin}>
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <AuthPageHeader
        icon={<Icon.Lock className="w-7 h-7" />}
        title="New password"
        subtitle={`At least ${PASSWORD_MIN_LENGTH} characters. Mix 8+ characters with uppercase letters, numbers and symbols for a stronger password.`}
      />

      <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
        {error && <Alert type="error" title="Reset failed" message={error} />}
        {linkInvalid && (
          <Button
            className="w-full mb-4"
            variant="outline"
            onClick={() => navigate(ROUTES.forgotPassword)}
          >
            Request a new reset link
          </Button>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5">
          {!tokenFromLink && (
            <Input
              label="Reset link"
              placeholder="Paste the link from your email"
              hint="You can paste the whole link or just the token after ?token="
              value={token}
              onChange={(e) => setToken(e.target.value)}
              icon={<Icon.Mail className="w-4 h-4" />}
            />
          )}
          <Input
            label="New password"
            placeholder="Enter your new password"
            type={showPwd ? 'text' : 'password'}
            autoComplete="new-password"
            autoFocus={!!tokenFromLink}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Icon.Lock className="w-4 h-4" />}
            suffix={
              <button
                type="button"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
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
                    className={`flex-1 h-1.5 rounded-full transition-colors ${i <= strength ? '' : 'bg-[#F3F4F6]'}`}
                    style={i <= strength ? { background: strengthColor[strength] } : undefined}
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
            placeholder="Re-enter your new password"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={confirmPassword && confirmPassword !== password ? 'Passwords do not match' : undefined}
            icon={<Icon.Lock className="w-4 h-4" />}
            suffix={
              <button
                type="button"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirm((s) => !s)}
                className="hover:text-[#374151] transition-colors"
              >
                {showConfirm ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Button className="w-full" loading={loading} type="submit">
            Set New Password
          </Button>
        </form>
      </div>
    </div>
  );
}
