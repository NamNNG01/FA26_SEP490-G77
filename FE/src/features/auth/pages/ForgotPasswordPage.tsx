import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { passwordService } from '@/services/password.service';
import { AuthPageHeader } from '../components/AuthPageHeader';

/** Seconds the user waits before asking for another reset email. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * ForgotPasswordPage
 *
 * Backend: POST /api/v1/auth/password/forgot { email }
 * The backend emails (Gmail SMTP) a single-use link to
 * /reset-password?token=<token>, handled by ResetPasswordPage.
 *
 * The backend always answers with the same message whether or not the email
 * is registered, so the success state never confirms an account exists.
 * LoginPage passes the email typed there as router state { email }.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? '';

  const [email, setEmail] = useState(prefillEmail);
  const [sentTo, setSentTo] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const sendResetLink = async (address: string) => {
    setLoading(true);
    setError('');
    try {
      setSentMessage(await passwordService.forgotPassword(address));
      setSentTo(address);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Backend validation (from ForgotPasswordRequest):
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Invalid email format');
      return;
    }
    if (trimmed.length > 255) {
      setError('Email must not exceed 255 characters');
      return;
    }

    await sendResetLink(trimmed);
  };

  const changeEmail = () => {
    setSentMessage('');
    setSentTo('');
    setError('');
  };

  return (
    <div className="flex flex-col">
      <AuthPageHeader
        icon={<Icon.Mail className="w-7 h-7" />}
        title={sentMessage ? 'Check your email' : 'Reset password'}
        subtitle={
          sentMessage
            ? 'We sent you a link to set a new password.'
            : "Enter your account email and we'll send you a link to reset your password."
        }
      />

      <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
        {error && <Alert type="error" title="Request failed" message={error} />}

        {!sentMessage ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5">
            <Input
              label="Email"
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Icon.Mail className="w-4 h-4" />}
              autoFocus
            />
            <Button className="w-full" loading={loading} type="submit">
              Send Reset Link
            </Button>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <div>
              <p className="text-sm text-content-soft">{sentMessage}</p>
              <p className="text-sm text-content-soft mt-3">
                Open the link sent to <span className="font-medium text-content break-all">{sentTo}</span>.
                It expires soon and can be used only once. Don't see it? Check your spam folder.
              </p>
            </div>
            <Button
              className="w-full"
              variant="outline"
              loading={loading}
              disabled={cooldown > 0}
              onClick={() => sendResetLink(sentTo)}
            >
              {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
            </Button>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={changeEmail}
                className="text-sm text-brand-ink hover:underline font-medium"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={() => navigate(ROUTES.resetPassword)}
                className="text-sm text-content-soft hover:text-content-secondary hover:underline"
              >
                Link not opening? Paste it manually
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => navigate(ROUTES.login, { state: { email: (sentTo || email).trim() } })}
            className="text-sm font-medium text-content-soft hover:text-brand-ink flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon.ChevronLeft className="w-4 h-4" />
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
