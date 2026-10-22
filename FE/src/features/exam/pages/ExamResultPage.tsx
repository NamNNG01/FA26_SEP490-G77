import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';

export function ExamResultPage() {
  const score = 87;
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="card p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-primary-light flex items-center justify-center mx-auto mb-4">
          <Icon.ClipboardList className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-extrabold text-content">Exam Complete</h2>
        <p className="text-lg text-content-soft mt-1">ML Fundamentals Final Exam</p>
        <div className="mt-6 flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-[clamp(2.5rem,1.5rem+4vw,3.5rem)] font-black leading-none text-content">{score}%</p>
            <p className="text-sm text-content-subtle mt-1">Your Score</p>
          </div>
        </div>
        <Badge variant="info" className="mt-4 text-base px-4 py-1">COMPLETED</Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Questions', value: '45' },
          { label: 'Correct', value: '39' },
          { label: 'Incorrect', value: '6' },
          { label: 'Time Taken', value: '1h 12m' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-xl font-bold text-content">{s.value}</p>
            <p className="text-xs text-content-subtle mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h4 className="text-lg font-semibold text-content mb-4">Performance by Topic</h4>
        <div className="space-y-3">
          {[
            { topic: 'Optimization Algorithms', correct: 9, total: 10, pct: 90 },
            { topic: 'Neural Network Architecture', correct: 8, total: 10, pct: 80 },
            { topic: 'Regularization Techniques', correct: 7, total: 10, pct: 70 },
            { topic: 'Model Evaluation', correct: 9, total: 10, pct: 90 },
            { topic: 'Feature Engineering', correct: 6, total: 10, pct: 60 },
          ].map(t => (
            <div key={t.topic} className="flex items-center gap-4">
              <span className="text-sm text-content-secondary w-40 sm:w-48 max-w-[40%] truncate flex-shrink-0" title={t.topic}>{t.topic}</span>
              <div className="flex-1">
                <Progress value={t.pct} color={t.pct >= 80 ? '#16A34A' : t.pct >= 70 ? '#D97706' : '#DC2626'} size="sm" />
              </div>
              <span className="text-xs font-medium text-content-secondary w-12 text-right">{t.correct}/{t.total}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" icon={<Icon.Eye className="w-4 h-4" />} className="flex-1">Review Answers</Button>
        <Button icon={<Icon.Award className="w-4 h-4" />} className="flex-1">View Certificate</Button>
      </div>
    </div>
  );
}
