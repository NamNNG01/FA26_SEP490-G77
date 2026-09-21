import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';

export function ExamRulesPage({ onStart }: { onStart?: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="card p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#EFF6FF] rounded-[14px] flex items-center justify-center mx-auto mb-4">
            <Icon.Shield className="w-7 h-7 text-[#2563EB]" />
          </div>
          <h2 className="text-[22px] font-bold text-[#111827]">Exam Rules & Guidelines</h2>
          <p className="text-[14px] text-[#6B7280] mt-1">ML Fundamentals Final — 45 Questions · 90 Minutes</p>
        </div>
        <div className="space-y-3 mb-6">
          {[
            { icon: <Icon.Clock />, rule: 'You have 90 minutes to complete 45 questions. The timer starts when you click Begin.' },
            { icon: <Icon.AlertCircle />, rule: 'Do not refresh the page or close the browser during the exam. Your progress is auto-saved every 30 seconds.' },
            { icon: <Icon.Eye />, rule: 'You may review and change your answers at any time before final submission.' },
            { icon: <Icon.Zap />, rule: 'AI hints are available for a maximum of 5 questions. Each hint deducts 2 marks from your score.' },
            { icon: <Icon.CheckCircle />, rule: 'Passing score is 70%. Certificates are issued instantly upon passing.' },
            { icon: <Icon.Shield />, rule: 'Exam integrity is monitored. Any suspicious activity will result in disqualification.' },
          ].map((r, i) => (
            <div key={i} className="flex gap-3 p-4 bg-[#F9FAFB] rounded-[10px]">
              <div className="w-5 h-5 text-[#2563EB] flex-shrink-0 mt-0.5">{r.icon}</div>
              <p className="text-[14px] text-[#374151] leading-relaxed">{r.rule}</p>
            </div>
          ))}
        </div>
        <Alert type="warning" title="Important" message="Once you start the exam, the timer cannot be paused. Make sure you're in a stable internet connection before proceeding." />
        <div className="mt-6 flex items-center gap-3">
          <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="w-4 h-4 accent-[#2563EB]" />
          <label htmlFor="agree" className="text-[14px] text-[#374151] cursor-pointer">I have read and agree to the exam rules and academic integrity policy.</label>
        </div>
        <Button className="w-full mt-4" disabled={!agreed} onClick={onStart} icon={<Icon.ChevronRight className="w-4 h-4" />}>Begin Exam</Button>
      </div>
    </div>
  );
}
