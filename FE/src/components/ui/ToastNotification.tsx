import React, { useEffect } from 'react';
import { Icon } from '@/assets/icons';

export interface ToastNotificationProps {
  variant?: 'error' | 'success' | 'warning' | 'info';
  type?: 'error' | 'success' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose?: () => void;
  duration?: number;
  autoClose?: boolean;
  isFloating?: boolean;
  className?: string;
}

export function ToastNotification({
  variant = 'error',
  type,
  title,
  message,
  onClose,
  duration = 4500,
  autoClose = true,
  isFloating = true,
  className = '',
}: ToastNotificationProps) {
  const currentVariant = type ?? variant;

  useEffect(() => {
    if (!autoClose || !onClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [autoClose, duration, onClose]);

  const variantStyles = {
    error: {
      container: 'bg-red-50/95 dark:bg-red-950/90 border-red-200 dark:border-red-900 text-red-900 dark:text-red-100',
      icon: <Icon.XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />,
      closeBtn: 'text-red-400 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100 hover:bg-red-100 dark:hover:bg-red-900/50',
    },
    success: {
      container: 'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-100',
      icon: <Icon.CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />,
      closeBtn: 'text-emerald-400 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/50',
    },
    warning: {
      container: 'bg-amber-50/95 dark:bg-amber-950/90 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-100',
      icon: <Icon.AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />,
      closeBtn: 'text-amber-400 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/50',
    },
    info: {
      container: 'bg-blue-50/95 dark:bg-blue-950/90 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-100',
      icon: <Icon.Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />,
      closeBtn: 'text-blue-400 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900/50',
    },
  }[currentVariant];

  const content = (
    <div
      role="alert"
      onClick={() => onClose?.()}
      className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border shadow-lg backdrop-blur-md max-w-sm w-full transition-all cursor-pointer select-none hover:shadow-xl ${variantStyles.container} ${className}`}
    >
      {variantStyles.icon}
      <div className="flex-1 min-w-0 pr-1">
        {title && <p className="text-sm font-semibold mb-0.5 leading-snug">{title}</p>}
        <p className="text-sm leading-snug break-words">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`p-1 -mr-1 -mt-1 rounded-md transition-colors ${variantStyles.closeBtn}`}
          aria-label="Dismiss"
        >
          <Icon.X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (isFloating) {
    return (
      <div className="fixed bottom-5 left-5 z-[9999] pointer-events-auto">
        {content}
      </div>
    );
  }

  return content;
}

