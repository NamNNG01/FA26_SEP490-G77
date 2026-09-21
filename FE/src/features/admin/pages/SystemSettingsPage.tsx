import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';

export function SystemSettingsPage() {
  const [tab, setTab] = useState('General');
  return (
    <div className="p-8 space-y-5">
      <h2 className="text-[22px] font-bold text-[#111827]">System Settings</h2>
      <Tabs tabs={['General', 'AI Settings', 'Notifications', 'Backup']} active={tab} onChange={setTab} />

      {tab === 'General' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <div className="card p-6 space-y-4">
              <h4 className="text-[16px] font-semibold text-[#111827]">Platform Configuration</h4>
              <Input label="Platform Name" defaultValue="CertifyAI" />
              <Input label="Support Email" defaultValue="support@certifyai.com" icon={<Icon.Mail className="w-4 h-4" />} />
              <Input label="Platform URL" defaultValue="https://certifyai.example.com" />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Default Language" value="en" options={[{ label: 'English', value: 'en' }, { label: 'Spanish', value: 'es' }]} />
                <Select label="Timezone" value="utc" options={[{ label: 'UTC', value: 'utc' }, { label: 'US/Eastern', value: 'est' }]} />
              </div>
              <div className="space-y-3 pt-2">
                {[
                  { label: 'Allow self-registration', desc: 'Students can create accounts without admin approval', on: false },
                  { label: 'Maintenance mode', desc: 'Disable access for all non-admin users', on: false },
                  { label: 'Analytics tracking', desc: 'Enable detailed usage analytics', on: true },
                ].map(s => (
                  <div key={s.label} className="flex items-start justify-between gap-4 py-3 border-t border-[#F9FAFB]">
                    <div>
                      <p className="text-[14px] font-medium text-[#374151]">{s.label}</p>
                      <p className="text-[12px] text-[#9CA3AF]">{s.desc}</p>
                    </div>
                    <Switch checked={s.on} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end"><Button>Save Settings</Button></div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <h4 className="text-[14px] font-semibold text-[#111827] mb-3">System Info</h4>
              <div className="space-y-2">
                {[['Version', 'CertifyAI 2.4.1'], ['Database', 'PostgreSQL 16.2'], ['Node', 'v20.11.0'], ['AI Model', 'certifyai-v3.2'], ['Last Backup', 'Today 03:00']].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[12px] text-[#9CA3AF]">{k}</span>
                    <span className="text-[12px] font-mono text-[#374151]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <Alert type="success" title="System Healthy" message="All services are running normally. Last checked 2 minutes ago." />
          </div>
        </div>
      )}

      {tab === 'AI Settings' && (
        <div className="card p-6 max-w-2xl space-y-5">
          <h4 className="text-[16px] font-semibold text-[#111827]">AI Configuration</h4>
          <div className="grid grid-cols-2 gap-4">
            <Select label="AI Model" value="v3" options={[{ label: 'certifyai-v3.2 (Latest)', value: 'v3' }, { label: 'certifyai-v2.8', value: 'v2' }]} />
            <Input label="Confidence Threshold" type="number" defaultValue="85" hint="Minimum % to auto-approve questions" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'Auto-approve high confidence questions', desc: '≥ 95% confidence score', on: true },
              { label: 'AI hints for all courses', desc: 'Enable AI hints by default for all exams', on: true },
              { label: 'Plagiarism detection', desc: 'Check for duplicate or similar questions', on: true },
              { label: 'Auto-generate explanations', desc: 'AI generates answer explanations automatically', on: false },
            ].map(s => (
              <div key={s.label} className="flex items-start justify-between gap-4 py-3 border-t border-[#F9FAFB]">
                <div>
                  <p className="text-[14px] font-medium text-[#374151]">{s.label}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{s.desc}</p>
                </div>
                <Switch checked={s.on} />
              </div>
            ))}
          </div>
          <Button>Save AI Settings</Button>
        </div>
      )}

      {tab === 'Backup' && (
        <div className="space-y-5 max-w-2xl">
          <div className="card p-5">
            <h4 className="text-[15px] font-semibold text-[#111827] mb-4">Backup Configuration</h4>
            <div className="space-y-3 mb-5">
              <Select label="Backup Frequency" value="daily" options={[{ label: 'Daily at 03:00 UTC', value: 'daily' }, { label: 'Weekly', value: 'weekly' }]} />
              <Input label="Retention (days)" type="number" defaultValue="30" />
            </div>
            <Button icon={<Icon.Database className="w-4 h-4" />}>Run Manual Backup</Button>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3F4F6]"><h4 className="text-[14px] font-semibold text-[#111827]">Backup History</h4></div>
            <div className="divide-y divide-[#F9FAFB]">
              {[
                { date: '2026-09-21 03:00', size: '14.2 GB', status: 'Success', type: 'Auto' },
                { date: '2026-09-20 03:00', size: '14.0 GB', status: 'Success', type: 'Auto' },
                { date: '2026-09-19 14:35', size: '13.9 GB', status: 'Success', type: 'Manual' },
              ].map(b => (
                <div key={b.date} className="flex items-center gap-4 px-5 py-3 hover:bg-[#F9FAFB]">
                  <Icon.Database className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-[#374151] font-mono">{b.date}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{b.size}</p>
                  </div>
                  <Badge variant={b.type === 'Manual' ? 'purple' : 'default'}>{b.type}</Badge>
                  <Badge variant="success">{b.status}</Badge>
                  <button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.Download className="w-4 h-4 text-[#6B7280]" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
