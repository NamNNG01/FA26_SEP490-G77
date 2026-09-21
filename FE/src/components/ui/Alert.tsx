import React from 'react';
import { Icon } from '@/assets/icons';

export function Toast({ type = 'success', message, onClose }: { type?: 'success' | 'error' | 'warning' | 'info'; message: string; onClose?: () => void }) {
  const cfg = {
    success: { icon: <Icon.CheckCircle className="w-5 h-5 text-[#16A34A]" />, bg: 'bg-white border-[#BBF7D0]' },
    error: { icon: <Icon.XCircle className="w-5 h-5 text-[#DC2626]" />, bg: 'bg-white border-[#FECACA]' },
    warning: { icon: <Icon.AlertCircle className="w-5 h-5 text-[#D97706]" />, bg: 'bg-white border-[#FDE68A]' },
    info: { icon: <Icon.Info className="w-5 h-5 text-[#2563EB]" />, bg: 'bg-white border-[#BFDBFE]' },
  }[type];
  return (
    <div className={`flex items-start gap-3 p-3.5 pr-4 rounded-[10px] border shadow-lg max-w-sm ${cfg.bg}`}>
      {cfg.icon}
      <p className="text-[13.5px] text-[#374151] flex-1">{message}</p>
      {onClose && <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#374151]"><Icon.X className="w-4 h-4" /></button>}
    </div>
  );
}

export function Alert({ type = 'info', title, message }: { type?: 'success' | 'error' | 'warning' | 'info'; title?: string; message: string }) {
  const cfg = {
    success: { icon: <Icon.CheckCircle className="w-5 h-5 text-[#16A34A]" />, bg: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]' },
    error: { icon: <Icon.XCircle className="w-5 h-5 text-[#DC2626]" />, bg: 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]' },
    warning: { icon: <Icon.AlertCircle className="w-5 h-5 text-[#D97706]" />, bg: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]' },
    info: { icon: <Icon.Info className="w-5 h-5 text-[#2563EB]" />, bg: 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]' },
  }[type];
  return (
    <div className={`flex gap-3 p-4 rounded-[10px] border ${cfg.bg}`}>
      <div className="flex-shrink-0">{cfg.icon}</div>
      <div>
        {title && <p className="text-[13.5px] font-semibold mb-0.5">{title}</p>}
        <p className="text-[13px] opacity-90">{message}</p>
      </div>
    </div>
  );
}
