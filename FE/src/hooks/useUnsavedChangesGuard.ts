import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';
import { ROUTES } from '@/app/routes';

/**
 * Guards a page with unsaved work:
 * - in-app navigation (links, navigate(), the browser Back button) is held
 *   by `blocker` until the user confirms — render <UnsavedChangesModal blocker={blocker} />;
 * - closing or reloading the tab shows the browser's own prompt.
 *
 * Call `leave(() => navigate(...))` for navigations that must not be
 * blocked, e.g. right after a successful save (the `when` flag only updates
 * on the next render, so it would still be true at that moment).
 *
 * `warnOnUnload` (default: `when`) controls the reload / tab-close prompt
 * separately — pages that keep their work across a reload can turn it off.
 */
export function useUnsavedChangesGuard(when: boolean, warnOnUnload: boolean = when) {
  const bypass = useRef(false);

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    when
    && !bypass.current
    // Signing out (or a session expiring) must always get through.
    && nextLocation.pathname !== ROUTES.login
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));

  useEffect(() => {
    if (!warnOnUnload) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [warnOnUnload]);

  // Nothing left to protect — let a held navigation through.
  useEffect(() => {
    if (!when && blocker.state === 'blocked') blocker.proceed();
  }, [when, blocker]);

  const leave = useCallback((go: () => void) => {
    bypass.current = true;
    go();
    // Re-arm after the navigation has been processed.
    setTimeout(() => { bypass.current = false; }, 0);
  }, []);

  return { blocker, leave };
}
