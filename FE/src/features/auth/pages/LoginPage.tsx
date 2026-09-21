import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/assets/icons';

export function LoginPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleLogin = () => { setLoading(true); setTimeout(() => setLoading(false), 1500); };
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center mx-auto mb-4 shadow-md">
            <Icon.Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-[26px] font-bold text-[#111827]">Welcome back</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">Sign in to CertifyAI</p>
        </div>
        <div className="card p-8 shadow-lg">
          <div className="space-y-4">
            <Input label="Email address" placeholder="you@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} icon={<Icon.Mail className="w-4 h-4" />} />
            <Input label="Password" placeholder="••••••••" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              icon={<Icon.Lock className="w-4 h-4" />}
              suffix={<button onClick={() => setShowPwd(s => !s)} className="hover:text-[#374151] transition-colors">{showPwd ? <Icon.EyeOff className="w-4 h-4" /> : <Icon.Eye className="w-4 h-4" />}</button>}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px] text-[#6B7280] cursor-pointer"><input type="checkbox" className="rounded" /> Remember me</label>
              <button onClick={() => onNavigate?.('forgot-password')} className="text-[13px] text-[#2563EB] hover:underline">Forgot password?</button>
            </div>
            <Button className="w-full" loading={loading} onClick={handleLogin}>Sign In</Button>
          </div>
          <div className="mt-6 pt-6 border-t border-[#F3F4F6]">
            <div className="grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 h-9 border border-[#E5E7EB] rounded-[10px] text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
              <button className="flex items-center justify-center gap-2 h-9 border border-[#E5E7EB] rounded-[10px] text-[13px] font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
                <Icon.Shield className="w-4 h-4 text-[#374151]" /> SSO
              </button>
            </div>
          </div>
        </div>
        <p className="text-center text-[13px] text-[#9CA3AF] mt-6">
          Don't have an account? <span className="text-[#2563EB] font-medium cursor-pointer hover:underline">Contact administrator</span>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#EFF6FF] border-2 border-[#BFDBFE] rounded-[14px] flex items-center justify-center mx-auto mb-4">
            <Icon.Mail className="w-6 h-6 text-[#2563EB]" />
          </div>
          <h1 className="text-[24px] font-bold text-[#111827]">Reset password</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">We'll send you a reset link</p>
        </div>
        <div className="card p-8">
          {!sent ? (
            <div className="space-y-4">
              <Input label="Email address" placeholder="you@example.com" type="email" icon={<Icon.Mail className="w-4 h-4" />} />
              <Button className="w-full" onClick={() => setSent(true)}>Send Reset Link</Button>
              <button onClick={() => onNavigate?.('login')} className="w-full text-center text-[13px] text-[#6B7280] hover:text-[#374151] flex items-center justify-center gap-1.5">
                <Icon.ChevronLeft className="w-4 h-4" /> Back to login
              </button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 bg-[#F0FDF4] rounded-full flex items-center justify-center mx-auto">
                <Icon.CheckCircle className="w-8 h-8 text-[#16A34A]" />
              </div>
              <div>
                <p className="text-[16px] font-semibold text-[#111827]">Check your email</p>
                <p className="text-[13px] text-[#6B7280] mt-1">We sent a reset link to your email address.</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => onNavigate?.('login')}>Back to Login</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#EFF6FF] to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#2563EB] rounded-[14px] flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Icon.Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-[24px] font-bold text-[#111827]">New password</h1>
          <p className="text-[14px] text-[#6B7280] mt-1">Must be at least 8 characters</p>
        </div>
        <div className="card p-8">
          <div className="space-y-4">
            <Input label="New Password" type="password" placeholder="••••••••" onChange={e => checkStrength(e.target.value)} icon={<Icon.Lock className="w-4 h-4" />} />
            {strength > 0 && (
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  {[1,2,3,4].map(i => <div key={i} className="flex-1 h-1.5 rounded-full transition-colors" style={{ background: i <= strength ? strengthColor[strength] : '#F3F4F6' }} />)}
                </div>
                <p className="text-[12px] font-medium" style={{ color: strengthColor[strength] }}>{strengthLabel[strength]}</p>
              </div>
            )}
            <Input label="Confirm Password" type="password" placeholder="••••••••" icon={<Icon.Lock className="w-4 h-4" />} />
            <Button className="w-full">Set New Password</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
