import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';

export function ExamResultPage() {
  const score = 87;
  const passed = score >= 70;
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="card p-8 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${passed ? 'bg-[#F0FDF4]' : 'bg-[#FEF2F2]'}`}>
          {passed ? <Icon.Trophy className={`w-10 h-10 text-[#16A34A]`} /> : <Icon.XCircle className="w-10 h-10 text-[#DC2626]" />}
        </div>
        <h2 className="text-[28px] font-extrabold text-[#111827]">{passed ? 'Congratulations!' : 'Keep Trying!'}</h2>
        <p className="text-[15px] text-[#6B7280] mt-1">ML Fundamentals Final Exam</p>
        <div className="mt-6 flex items-center justify-center gap-8">
          <div className="text-center">
            <p className={`text-[56px] font-black leading-none ${passed ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>{score}%</p>
            <p className="text-[13px] text-[#9CA3AF] mt-1">Your Score</p>
          </div>
          <div className="w-px h-16 bg-[#F3F4F6]" />
          <div className="text-center">
            <p className="text-[56px] font-black leading-none text-[#9CA3AF]">70%</p>
            <p className="text-[13px] text-[#9CA3AF] mt-1">Pass Mark</p>
          </div>
        </div>
        <Badge variant={passed ? 'success' : 'danger'} className="mt-4 text-[14px] px-4 py-1">{passed ? 'PASSED' : 'FAILED'}</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Questions', value: '45' },
          { label: 'Correct', value: '39' },
          { label: 'Incorrect', value: '6' },
          { label: 'Time Taken', value: '1h 12m' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-[22px] font-bold text-[#111827]">{s.value}</p>
            <p className="text-[12px] text-[#9CA3AF] mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h4 className="text-[16px] font-semibold text-[#111827] mb-4">Performance by Topic</h4>
        <div className="space-y-3">
          {[
            { topic: 'Optimization Algorithms', correct: 9, total: 10, pct: 90 },
            { topic: 'Neural Network Architecture', correct: 8, total: 10, pct: 80 },
            { topic: 'Regularization Techniques', correct: 7, total: 10, pct: 70 },
            { topic: 'Model Evaluation', correct: 9, total: 10, pct: 90 },
            { topic: 'Feature Engineering', correct: 6, total: 10, pct: 60 },
          ].map(t => (
            <div key={t.topic} className="flex items-center gap-4">
              <span className="text-[13px] text-[#374151] w-40 sm:w-48 max-w-[40%] truncate flex-shrink-0" title={t.topic}>{t.topic}</span>
              <div className="flex-1">
                <Progress value={t.pct} color={t.pct >= 80 ? '#16A34A' : t.pct >= 70 ? '#D97706' : '#DC2626'} size="sm" />
              </div>
              <span className="text-[12px] font-medium text-[#374151] w-12 text-right">{t.correct}/{t.total}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" icon={<Icon.Eye className="w-4 h-4" />} className="flex-1">Review Answers</Button>
        {passed && <Button icon={<Icon.Award className="w-4 h-4" />} className="flex-1">View Certificate</Button>}
        {!passed && <Button icon={<Icon.RefreshCw className="w-4 h-4" />} className="flex-1">Retake Exam</Button>}
      </div>
    </div>
  );
}
