import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
 *
 * Toasts auto-dismiss after ~4s.
 */

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

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

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
  }, []);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end">
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
  useEffect(() => {
    const timer = setTimeout(() => onDone(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDone]);

  const style = KIND_STYLES[toast.kind];
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 px-4 py-3 rounded-[10px] border shadow-lg max-w-sm ${style.classes}`}
    >
      <span className="flex-shrink-0 mt-0.5">{style.icon}</span>
      <p className="text-sm flex-1 text-foreground">{toast.message}</p>
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
  return {
    show,
    success: (m: string) => show('success', m),
    error: (m: string) => show('error', m),
    info: (m: string) => show('info', m),
    warning: (m: string) => show('warning', m),
  };
}
