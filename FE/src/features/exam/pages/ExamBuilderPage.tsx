import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';

export function ExamBuilderPage() {
  const [tab, setTab] = useState('Settings');
  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">Exam Builder</h2>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Eye className="w-4 h-4" />}>Preview</Button>
          <Button variant="secondary">Save Draft</Button>
          <Button icon={<Icon.CheckCircle className="w-4 h-4" />}>Publish Exam</Button>
        </div>
      </div>

      <Tabs tabs={['Settings', 'Questions', 'Random', 'Preview']} active={tab} onChange={setTab} />

      {tab === 'Settings' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 card p-6 space-y-4">
            <Input label="Exam Title" defaultValue="ML Fundamentals — Final Examination" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Duration (minutes)" type="number" defaultValue="90" />
              <Input label="Pass Mark (%)" type="number" defaultValue="70" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label="Subject" value="ml" options={[{ label: 'Machine Learning', value: 'ml' }]} />
              <Select label="Attempts Allowed" value="2" options={[{ label: '1 attempt', value: '1' }, { label: '2 attempts', value: '2' }, { label: 'Unlimited', value: '0' }]} />
            </div>
            <div>
              <label className="text-[13px] font-medium text-[#374151] block mb-1.5">Description</label>
              <textarea className="w-full h-20 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" defaultValue="Comprehensive final examination covering all ML Fundamentals topics from the course curriculum." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-medium text-[#374151] block mb-2">Options</label>
                <div className="space-y-2">
                  <Switch label="Shuffle questions" checked={true} size="sm" />
                  <Switch label="Shuffle answers" checked={true} size="sm" />
                  <Switch label="Allow review" checked={false} size="sm" />
                  <Switch label="Show AI hints" checked={true} size="sm" />
                </div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-[#374151] block mb-2">Certification</label>
                <div className="space-y-2">
                  <Switch label="Issue certificate" checked={true} size="sm" />
                  <Switch label="Require proctoring" checked={false} size="sm" />
                  <Switch label="Notify on pass" checked={true} size="sm" />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Exam Summary</h4>
              <div className="space-y-3">
                {[{ label: 'Questions', value: '45' }, { label: 'Duration', value: '90 min' }, { label: 'Pass mark', value: '70%' }, { label: 'Max score', value: '100 pts' }, { label: 'AI hints', value: '5 max' }].map(s => (
                  <div key={s.label} className="flex justify-between">
                    <span className="text-[13px] text-[#6B7280]">{s.label}</span>
                    <span className="text-[13px] font-semibold text-[#374151]">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <Alert type="info" message="AI will automatically review question quality and flag potential issues before publishing." />
          </div>
        </div>
      )}

      {tab === 'Questions' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 card overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F3F4F6] flex items-center gap-3">
              <p className="text-[14px] font-semibold text-[#111827]">Selected Questions (45)</p>
              <div className="flex-1" />
              <Button variant="outline" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />}>Add from Bank</Button>
              <Button variant="outline" size="sm" icon={<Icon.RefreshCw className="w-3.5 h-3.5" />}>Random Fill</Button>
            </div>
            <div className="divide-y divide-[#F9FAFB] max-h-[400px] overflow-y-auto">
              {[
                { n: 1, q: 'What is gradient descent?', topic: 'Optimization', pts: 2, diff: 'Medium' },
                { n: 2, q: 'Explain the bias-variance tradeoff.', topic: 'ML Theory', pts: 3, diff: 'Hard' },
                { n: 3, q: 'What is the purpose of softmax?', topic: 'Neural Nets', pts: 2, diff: 'Medium' },
                { n: 4, q: 'Difference between L1 and L2 regularization?', topic: 'Regularization', pts: 2, diff: 'Hard' },
                { n: 5, q: 'What is cross-entropy loss?', topic: 'Loss Functions', pts: 2, diff: 'Medium' },
              ].map(q => (
                <div key={q.n} className="flex items-center gap-3 px-4 py-3 hover:bg-[#F9FAFB]">
                  <span className="text-[12px] font-mono text-[#D1D5DB] w-5 text-right">{q.n}</span>
                  <p className="text-[13px] text-[#374151] flex-1">{q.q}</p>
                  <Badge variant="info" className="text-[11px]">{q.topic}</Badge>
                  <Badge variant={q.diff === 'Hard' ? 'danger' : 'warning'} className="text-[11px]">{q.diff}</Badge>
                  <span className="text-[12px] text-[#9CA3AF]">{q.pts}pt</span>
                  <button className="text-[#9CA3AF] hover:text-[#DC2626] p-1"><Icon.X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">By Topic</h4>
            <div className="space-y-2.5">
              {[
                { topic: 'Optimization', count: 10, pts: 20 },
                { topic: 'Neural Nets', count: 10, pts: 20 },
                { topic: 'ML Theory', count: 8, pts: 24 },
                { topic: 'Regularization', count: 9, pts: 18 },
                { topic: 'Evaluation', count: 8, pts: 18 },
              ].map(t => (
                <div key={t.topic} className="flex items-center justify-between text-[13px]">
                  <span className="text-[#374151]">{t.topic}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{t.count}Q</Badge>
                    <span className="text-[#9CA3AF]">{t.pts}pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
