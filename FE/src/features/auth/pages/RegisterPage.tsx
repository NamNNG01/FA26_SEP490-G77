import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { Icon } from '@/assets/icons';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setConfirmError('');

    // Backend validation (from RegisterRequest):
    // - Email: @NotBlank, @Email, @Size(max=150)
    // - Password: @NotBlank, @Size(min=6)
    // - Full name: @NotBlank, @Size(max=100)
    if (!email.trim()) {
      setError('Email is required');
      setLoading(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Invalid email format');
      setLoading(false);
      return;
    }
    if (email.length > 150) {
      setError('Email must not exceed 150 characters');
      setLoading(false);
      return;
    }
    if (!password) {
      setError('Password is required');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    if (!fullName.trim()) {
      setError('Full name is required');
      setLoading(false);
      return;
    }
    if (fullName.length > 100) {
      setError('Full name must not exceed 100 characters');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      setLoading(false);
      return;
    }

    try {
      // Auth state is updated at this point — navigate after it commits.
      // Backend register always creates STUDENT accounts; use the fresh
      // user returned by register() rather than stale context state.
      const registeredUser = await register(email, password, fullName);
      navigate(landingPathForRole(registeredUser.role?.code), { replace: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Registration failed. Please try again.';
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
            <Icon.User className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-[26px] font-bold text-[#111827]">
            Create your account
          </h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Join CertifyAI to start learning.
          </p>
        </div>

        <div className="card p-8 shadow-lg">
          {error && <Alert type="error" title="Registration failed" message={error} />}
          {confirmError && (
            <Alert type="error" title="Password mismatch" message={confirmError} />
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Full name"
              placeholder="Enter your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              icon={<Icon.User className="w-4 h-4" />}
            />
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
            <Input
              label="Confirm password"
              placeholder="Confirm your password"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<Icon.Lock className="w-4 h-4" />}
              suffix={
                <button
                  onClick={() => setShowConfirm((s) => !s)}
                  className="hover:text-[#374151] transition-colors"
                >
                  {showConfirm ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}
                </button>
              }
            />
            <Button className="w-full" loading={loading} type="submit">
              Create Account
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-[#F3F4F6] flex flex-col gap-3 items-center">
            <p className="text-[13px] text-[#6B7280] flex items-center gap-2">
              Already have an account?{' '}
              <button
                onClick={() => (window.location.href = '/login')}
                className="text-[13px] text-[#2563EB] hover:underline font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
