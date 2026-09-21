import React from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';

export function NotificationsPage() {
  const notifs = [
    { type: 'success', title: 'Exam Passed!', message: 'You passed ML Fundamentals Final with 87%. Certificate is ready.', time: '2m ago', read: false },
    { type: 'info', title: 'New Course Available', message: 'Advanced Neural Networks course is now available in your curriculum.', time: '1h ago', read: false },
    { type: 'warning', title: 'Exam Tomorrow', message: 'Deep Learning Mid-Exam is scheduled for tomorrow at 9:00 AM.', time: '3h ago', read: true },
    { type: 'info', title: 'AI Hint Added', message: 'AI hints are now available for the Statistics practice exam.', time: '5h ago', read: true },
    { type: 'success', title: 'Certificate Issued', message: 'Your Python Fundamentals certificate has been officially issued.', time: '1d ago', read: true },
    { type: 'warning', title: 'Assignment Due Soon', message: 'Python Chapter 5 assignment is due in 24 hours.', time: '1d ago', read: true },
  ];
  const iconMap = { success: <Icon.CheckCircle className="w-5 h-5 text-[#16A34A]" />, warning: <Icon.AlertCircle className="w-5 h-5 text-[#D97706]" />, info: <Icon.Info className="w-5 h-5 text-[#2563EB]" /> };
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[22px] font-bold text-[#111827]">Notifications</h2>
        <Button variant="ghost" size="sm">Mark all as read</Button>
      </div>
      <div className="card overflow-hidden">
        {notifs.map((n, i) => (
          <div key={i} className={`flex gap-3.5 p-4 ${i > 0 ? 'border-t border-[#F9FAFB]' : ''} ${!n.read ? 'bg-[#F9FAFB]' : 'bg-white'} hover:bg-[#F9FAFB] transition-colors`}>
            <div className="flex-shrink-0 mt-0.5">{iconMap[n.type as keyof typeof iconMap]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={`text-[14px] ${!n.read ? 'font-semibold text-[#111827]' : 'font-medium text-[#374151]'}`}>{n.title}</p>
                <span className="text-[12px] text-[#9CA3AF] flex-shrink-0">{n.time}</span>
              </div>
              <p className="text-[13px] text-[#6B7280] mt-0.5">{n.message}</p>
            </div>
            {!n.read && <div className="w-2 h-2 rounded-full bg-[#2563EB] mt-2 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  );
}
