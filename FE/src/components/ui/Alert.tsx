import React from 'react';
import { Icon } from '@/assets/icons';

export function Toast({ type = 'success', message, onClose }: { type?: 'success' | 'error' | 'warning' | 'info'; message: string; onClose?: () => void }) {
  const cfg = {
    success: { icon: <Icon.CheckCircle className="w-5 h-5 text-success" />, bg: 'bg-surface border-success-line' },
    error: { icon: <Icon.XCircle className="w-5 h-5 text-danger" />, bg: 'bg-surface border-danger-line' },
    warning: { icon: <Icon.AlertCircle className="w-5 h-5 text-warning" />, bg: 'bg-surface border-warning-line' },
    info: { icon: <Icon.Info className="w-5 h-5 text-brand-ink" />, bg: 'bg-surface border-brand-line' },
  }[type];
  return (
    <div className={`flex items-start gap-3 p-3.5 pr-4 rounded-[10px] border shadow-lg max-w-sm ${cfg.bg}`}>
      {cfg.icon}
      <p className="text-sm text-content-secondary flex-1">{message}</p>
      {onClose && <button onClick={onClose} className="text-content-subtle hover:text-content-secondary"><Icon.X className="w-4 h-4" /></button>}
    </div>
  );
}

export function Alert({ type = 'info', title, message }: { type?: 'success' | 'error' | 'warning' | 'info'; title?: string; message: string }) {
  const cfg = {
    success: { icon: <Icon.CheckCircle className="w-5 h-5 text-success" />, bg: 'bg-success-light border-success-line text-success-strong' },
    error: { icon: <Icon.XCircle className="w-5 h-5 text-danger" />, bg: 'bg-danger-light border-danger-line text-danger-strong' },
    warning: { icon: <Icon.AlertCircle className="w-5 h-5 text-warning" />, bg: 'bg-warning-light border-warning-line text-warning-strong' },
    info: { icon: <Icon.Info className="w-5 h-5 text-brand-ink" />, bg: 'bg-primary-light border-brand-line text-brand-ink-strong' },
  }[type];
  return (
    <div className={`flex gap-3 p-4 rounded-[10px] border ${cfg.bg}`}>
      <div className="flex-shrink-0">{cfg.icon}</div>
      <div>
        {title && <p className="text-sm font-semibold mb-0.5">{title}</p>}
        <p className="text-sm opacity-90">{message}</p>
      </div>
    </div>
  );
}
