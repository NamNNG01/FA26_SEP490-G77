import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '@/assets/icons';

/**
 * ToastHost
 *
 * App-level toast host mounted ONCE (in App.tsx) above the router, so a
 * toast survives route changes (e.g. the redirect to /login after
 * logout-all). Reusable via the useToast() hook:
 *
 *   const toast = useToast();
 *   toast.success('Saved');
 *   toast.error('Something went wrong');
 *   toast.info('Draft restored', { action: { label: 'Discard', onClick }, duration: 10000 });
 *
 * Toasts auto-dismiss after ~4s (pass `duration`, or null to keep one until
 * it is closed). Hovering a toast pauses its timer.
 */

type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  /** Bold first line; the message goes under it. */
  title?: string;
  /** Extra lines shown as a bullet list (e.g. a backend's field errors). */
  details?: string[];
  /** One button inside the toast; clicking it also closes the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it closes by itself; null = stays until closed. */
  duration?: number | null;
}

interface ToastItem extends ToastOptions {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;

const KIND_STYLES: Record<ToastKind, { icon: ReactNode; classes: string }> = {
  success: {
    icon: <Icon.CheckCircle className="w-5 h-5" />,
    classes: 'text-success bg-success-light border-success-line',
  },
  error: {
    icon: <Icon.XCircle className="w-5 h-5" />,
    classes: 'text-danger bg-danger-light border-danger-line',
  },
  warning: {
    icon: <Icon.AlertCircle className="w-5 h-5" />,
    classes: 'text-warning bg-warning-light border-warning-line',
  },
  info: {
    icon: <Icon.Info className="w-5 h-5" />,
    classes: 'text-info bg-info-light border-brand-line',
  },
};

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message, ...options }]);
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[100] flex flex-col gap-2 items-end">
        {items.map((t) => (
          <ToastCard key={t.id} toast={t} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({
  toast,
  onDone,
}: {
  toast: ToastItem;
  onDone: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration === undefined ? DEFAULT_DURATION : toast.duration;

  useEffect(() => {
    if (duration == null || paused) return;
    const timer = setTimeout(() => onDone(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, onDone, duration, paused]);

  const style = KIND_STYLES[toast.kind];
  return (
    <div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={`flex items-start gap-2.5 px-4 py-3 rounded-[10px] border shadow-lg w-full sm:w-auto max-w-sm ${style.classes}`}
    >
      <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
      <div className="flex-1 min-w-0 text-sm text-foreground">
        {toast.title && <p className="font-semibold">{toast.title}</p>}
        <p>{toast.message}</p>
        {toast.details && toast.details.length > 0 && (
          <ul className="mt-1 list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
            {toast.details.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action!.onClick(); onDone(toast.id); }}
            className="mt-2 text-sm font-semibold underline underline-offset-2 hover:opacity-80 cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => onDone(toast.id)}
        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label="Dismiss"
      >
        <Icon.X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastHost');
  const { show } = ctx;
  return useMemo(() => ({
    show,
    success: (m: string, o?: ToastOptions) => show('success', m, o),
    error: (m: string, o?: ToastOptions) => show('error', m, o),
    info: (m: string, o?: ToastOptions) => show('info', m, o),
    warning: (m: string, o?: ToastOptions) => show('warning', m, o),
  }), [show]);
}
