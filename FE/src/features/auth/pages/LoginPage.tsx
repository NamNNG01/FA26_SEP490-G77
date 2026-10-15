import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { AuthPageHeader } from '../components/AuthPageHeader';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * Router state LoginPage understands:
 *   from          — where to go after signing in (set by the route guard)
 *   email         — prefill (e.g. coming back from Forgot / Reset password)
 *   passwordReset — show the "password updated" banner after AUTH-07
 */
type LoginLocationState = { from?: string; email?: string; passwordReset?: boolean } | null;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState;

  const [email, setEmail] = useState(locationState?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Auth state is updated at this point (login() sets it before
      // resolving) — only NOW navigate, so the router renders the
      // authenticated branch in the same commit. Use the FRESH user
      // returned by login(); the context value in this closure is stale.
      const loggedInUser = await login(email, password);
      const from = locationState?.from;
      navigate(from ?? landingPathForRole(loggedInUser.role), { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col">
        <AuthPageHeader title="Welcome back" subtitle="Sign in to CertifyAI" />

        <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
          {error && <Alert type="error" title="Authentication failed" message={error} />}
          {!error && locationState?.passwordReset && (
            <Alert
              type="success"
              title="Password updated"
              message="Sign in with your new password. All other sessions have been signed out."
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5">
            <Input
              label="Email"
              placeholder="Enter your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Icon.Mail className="w-4 h-4" />}
            />
            <Input
              label="Password"
              placeholder="Enter your password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Icon.Lock className="w-4 h-4" />}
              suffix={
                <button
                  onClick={() => setShowPwd((s) => !s)}
                  className="hover:text-[#374151] transition-colors"
                >
                  {showPwd ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Button className="w-full" loading={loading} type="submit">
              Sign In
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-[#F3F4F6] flex flex-col gap-3 items-center">
            <p className="text-[13px] text-[#6B7280] flex items-center gap-2">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-[13px] text-[#2563EB] hover:underline font-medium cursor-pointer"
              >
                Create one
              </button>
            </p>
            <button
              type="button"
              onClick={() => navigate(ROUTES.forgotPassword, { state: { email: email.trim() } })}
              className="text-[13px] text-[#2563EB] hover:underline font-medium"
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
