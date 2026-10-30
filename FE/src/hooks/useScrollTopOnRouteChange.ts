import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Scrolls a layout's scroll container back to the top when the route path changes.
 *
 * `html, body, #root` are `overflow: hidden`, so each layout scrolls inside its own element, which
 * stays mounted across routes — without this, opening a course from the bottom of the landing page
 * lands at the bottom of the course page. Only the path counts: a query change (catalog filters,
 * `?checkout=1` being dropped) keeps the position.
 */
export function useScrollTopOnRouteChange<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    ref.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return ref;
}
