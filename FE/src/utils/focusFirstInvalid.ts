import { flushSync } from 'react-dom';

/**
 * Scrolls to and focuses the first visible `[aria-invalid="true"]` control, so a field error is
 * never left below the fold of a long modal. `root` defaults to the top-most open modal dialog, else the
 * page. Returns false when no invalid control is on screen (e.g. it sits on another step or tab).
 */
export function focusFirstInvalid(root?: ParentNode): boolean {
  // aria-modal skips popovers that also use role="dialog" (notification bell, type picker).
  const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  const scope = root ?? dialogs[dialogs.length - 1] ?? document;
  const target = Array.from(scope.querySelectorAll<HTMLElement>('[aria-invalid="true"]'))
    .find(el => el.offsetParent !== null);
  if (!target) return false;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.focus({ preventScroll: true });
  return true;
}

/**
 * Applies a state update that sets field errors, renders it right away, then focuses the first
 * invalid field: `focusFirstInvalidAfter(() => setErrors(next))`. Call it from an event handler
 * or a `catch`, never during render.
 */
export function focusFirstInvalidAfter(update: () => void, root?: ParentNode): boolean {
  flushSync(update);
  return focusFirstInvalid(root);
}
