import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grows a textarea to fit its text, so it never shows a scrollbar. Its CSS
 * min-height stays the floor. Re-measures when the text changes and when the
 * width changes (wrapping, or a hidden panel being shown).
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      // scrollHeight leaves out the border; box-sizing is border-box.
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, value]);
}
