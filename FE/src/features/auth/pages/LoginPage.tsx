import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { Icon } from '@/assets/icons';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
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
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? landingPathForRole(loggedInUser.role?.code), { replace: true });
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
      <div className="p-6 sm:p-8">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center mx-auto mb-4 shadow-md">
            <Icon.Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-[26px] font-bold text-[#111827]">Welcome back</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Sign in to CertifyAI
          </p>
        </div>

        <div className="card p-8 shadow-lg">
          {error && <Alert type="error" title="Authentication failed" message={error} />}

          <form onSubmit={handleSubmit} className="space-y-5">
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
                onClick={() => (window.location.href = '/register')}
                className="text-[13px] text-[#2563EB] hover:underline font-medium"
              >
                Create one
              </button>
            </p>
            <button
              type="button"
              onClick={() => (window.location.href = '/forgot-password')}
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
