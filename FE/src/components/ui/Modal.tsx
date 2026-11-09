import React, { useEffect, useRef } from 'react';
import { Icon } from '@/assets/icons';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, newest last: only the top one handles Escape / Tab, and the page scrolls again once none is open. */
const openModals: object[] = [];

/**
 * `dismissible={false}` hides the close button and ignores Escape / backdrop clicks — for a step
 * that must finish first (an upload, a running job).
 * `error` is pinned between the body and the footer, outside the scroll area, so a failed submit
 * is visible wherever the body is scrolled.
 */
export function Modal({ open, isOpen, onClose, title, children, footer, error, size = 'md', dismissible = true }: {
  open?: boolean; isOpen?: boolean; onClose: () => void; title?: string; children: React.ReactNode;
  footer?: React.ReactNode; error?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'screen'; dismissible?: boolean;
}) {
  const isVisible = Boolean(open ?? isOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // Read at call time, so toggling `dismissible` needs no re-subscription.
  onCloseRef.current = dismissible ? onClose : () => {};

  useEffect(() => {
    if (!isVisible) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const self = {};
    openModals.push(self);

    document.body.style.overflow = 'hidden';
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      // A modal opened over this one owns the keyboard.
      if (openModals[openModals.length - 1] !== self) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      openModals.splice(openModals.indexOf(self), 1);
      if (openModals.length === 0) document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isVisible]);

  if (!isVisible) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl', full: 'max-w-[85vw] h-[85vh]', screen: 'max-w-[90vw] h-[90vh]' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => onCloseRef.current()} />
      <div ref={panelRef} role="dialog" aria-modal="true" className={`relative min-w-0 bg-surface rounded-[14px] shadow-xl w-full ${widths[size]} flex flex-col max-h-[90vh]`}>
        {title && (
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line-soft">
            <h3 className="min-w-0 text-lg font-semibold text-content">{title}</h3>
            {dismissible && <button onClick={onClose} aria-label="Close" className="text-content-subtle hover:text-content-secondary transition-colors"><Icon.X className="w-5 h-5" /></button>}
          </div>
        )}
        <div className="min-w-0 px-6 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
        {error && <div className="min-w-0 px-4 sm:px-6 pt-3 pb-1 max-h-32 overflow-y-auto">{error}</div>}
        {footer && <div className="min-w-0 px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
