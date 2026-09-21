import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Icon } from '@/assets/icons';

export function SettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h2 className="text-[22px] font-bold text-[#111827]">Settings</h2>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <div className="card p-6">
            <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Notifications</h4>
            <div className="space-y-4">
              {[
                { label: 'Email notifications', desc: 'Receive exam reminders and results via email', on: true },
                { label: 'Exam reminders', desc: 'Get notified 24h before scheduled exams', on: true },
                { label: 'AI hint availability', desc: 'Alert when AI hints are available for practice', on: false },
                { label: 'Certificate issuance', desc: 'Notify when a new certificate is ready', on: true },
              ].map(item => (
                <div key={item.label} className="flex items-start justify-between gap-4 pb-4 border-b border-[#F9FAFB] last:border-0 last:pb-0">
                  <div>
                    <p className="text-[14px] font-medium text-[#374151]">{item.label}</p>
                    <p className="text-[12px] text-[#9CA3AF] mt-0.5">{item.desc}</p>
                  </div>
                  <Switch checked={item.on} />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-6">
            <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Security</h4>
            <div className="space-y-4">
              <Input label="Current Password" type="password" placeholder="••••••••" icon={<Icon.Lock className="w-4 h-4" />} />
              <Input label="New Password" type="password" placeholder="••••••••" icon={<Icon.Lock className="w-4 h-4" />} />
              <Input label="Confirm New Password" type="password" placeholder="••••••••" icon={<Icon.Lock className="w-4 h-4" />} />
              <div className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-[10px]">
                <div>
                  <p className="text-[14px] font-medium text-[#374151]">Two-factor authentication</p>
                  <p className="text-[12px] text-[#9CA3AF]">Add extra security to your account</p>
                </div>
                <Switch checked={false} />
              </div>
              <Button>Update Password</Button>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Preferences</h4>
            <div className="space-y-3">
              {[
                { label: 'Dark mode', on: false },
                { label: 'Compact view', on: false },
                { label: 'Show AI hints', on: true },
                { label: 'Auto-save answers', on: true },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <p className="text-[13px] text-[#374151]">{item.label}</p>
                  <Switch checked={item.on} size="sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Danger Zone</h4>
            <div className="space-y-2">
              <Button variant="outline" className="w-full text-[#DC2626] border-[#FECACA] hover:bg-[#FEF2F2]" size="sm">Deactivate Account</Button>
              <Button variant="danger" className="w-full" size="sm">Delete Account</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
