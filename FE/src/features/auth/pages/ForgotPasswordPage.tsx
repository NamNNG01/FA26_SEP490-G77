import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';

/**
 * ForgotPasswordPage
 *
 * Backend: POST /api/v1/auth/forgot-password
 * (stub — the backend Authentication API does not include a
 * /forgot-password endpoint. Wire to the real endpoint when it exists.)
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <div className="p-6 sm:p-8">
        <div className="text-center mb-10">
          <div className="w-12 h-12 bg-[#EFF6FF] border-2 border-[#BFDBFE] rounded-[14px] flex items-center justify-center mx-auto mb-4">
            <Icon.Mail className="w-6 h-6 text-[#2563EB]" />
          </div>
          <h1 className="text-[24px] font-bold text-[#111827]">Reset password</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">
            We'll send you a reset link
          </p>
        </div>

        <div className="card p-8 shadow-lg">
          {!sent ? (
            <div className="space-y-5">
              <Input
                label="Email"
                placeholder="Enter your email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<Icon.Mail className="w-4 h-4" />}
              />
              <Button className="w-full" loading={loading} onClick={() => setSent(true)}>
                Send Reset Link
              </Button>
              <button
                onClick={() => (window.location.href = '/login')}
                className="w-full text-center text-[13px] text-[#6B7280] hover:text-[#374151] flex items-center justify-center gap-1.5"
              >
                <Icon.ChevronLeft className="w-4 h-4" />
                Back to login
              </button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto">
                <Icon.CheckCircle className="w-8 h-8 text-[#16A34A]" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[#111827]">Check your email</p>
                <p className="text-[13px] text-[#6B7280] mt-1">
                  We sent a reset link to your email address.
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => (window.location.href = '/login')}>
                Back to Login
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
