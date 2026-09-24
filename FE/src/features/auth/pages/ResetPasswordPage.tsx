import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';

/**
 * ResetPasswordPage
 *
 * Backend: POST /api/v1/auth/reset-password
 * (stub — the backend Authentication API does not include a
 * /reset-password endpoint. Wire to the real endpoint when it exists.)
 */
export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [strength, setStrength] = useState(0);

  const checkStrength = (v: string) => {
    let s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    setStrength(s);
  };

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColor = ['', '#DC2626', '#D97706', '#2563EB', '#16A34A'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (password !== confirmPassword) {
      // password mismatch — handled inline
      return;
    }
    // TODO: POST to /api/v1/auth/reset-password
    setLoading(false);
  };

  return (
    <>
      <div className="p-6 sm:p-8">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center mx-auto mb-4 shadow-md">
            <Icon.Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[24px] font-bold text-[#111827]">New password</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            Must be at least 8 characters
          </p>
        </div>

        <div className="card p-8 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="New password"
              placeholder="Enter your password"
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                checkStrength(e.target.value);
              }}
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
            {strength > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="flex-1 h-1.5 rounded-full transition-colors"
                      style={{
                        background: i <= strength ? strengthColor[strength] : '#F3F4F6',
                      }}
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
              Set new password
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
