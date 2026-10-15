import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { passwordService } from '@/services/password.service';
import { AuthPageHeader } from '../components/AuthPageHeader';

/**
 * ForgotPasswordPage
 *
 * Backend: POST /api/v1/auth/password/forgot { email }
 * The backend always answers with the same message whether or not the email
 * is registered, so the success state never confirms an account exists.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    setLoading(true);
    try {
      setSentMessage(await passwordService.forgotPassword(trimmed));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <AuthPageHeader title="Forgot password" subtitle="We'll send you a link to reset it." />

      <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
        {!sentMessage ? (
          <>
            {error && <Alert type="error" title="Request failed" message={error} />}

            <form onSubmit={handleSubmit} className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5">
              <Input
                label="Email"
                placeholder="Enter your account email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Icon.Mail className="w-4 h-4" />}
              />
              <Button className="w-full" loading={loading} type="submit">
                Send Reset Link
              </Button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto">
              <Icon.CheckCircle className="w-8 h-8 text-[#16A34A]" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-[#111827]">Check your email</p>
              <p className="text-[13px] text-[#6B7280] mt-1">{sentMessage}</p>
            </div>
            <Button className="w-full" onClick={() => navigate(ROUTES.resetPassword)}>
              I have a reset code
            </Button>
          </div>
        )}

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
