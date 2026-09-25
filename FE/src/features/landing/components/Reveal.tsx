import React, { useEffect, useRef, useState } from 'react';

/**
 * Reveal
 *
 * Animates its children into view the first time they enter the viewport
 * (IntersectionObserver, fires once). Used by every landing card/section so
 * content fades+slides in on scroll. Degrades to "always visible" when
 * IntersectionObserver is unavailable.
 */

type RevealDirection = 'up' | 'down' | 'left' | 'right';

/** Hidden state per direction — the element animates FROM this transform. */
const hiddenByDirection: Record<RevealDirection, string> = {
  up: 'opacity-0 translate-y-6',
  down: 'opacity-0 -translate-y-6',
  left: 'opacity-0 translate-x-6',
  right: 'opacity-0 -translate-x-6',
};

interface RevealProps {
  children: React.ReactNode;
  /** Stagger delay in ms before the transition starts. */
  delay?: number;
  /** Which side the content slides in from (default: up). */
  direction?: RevealDirection;
  className?: string;
}

export function Reveal({ children, delay = 0, direction = 'up', className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // SSR / very old browsers: just show the content.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect(); // animate once, then stop observing
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? 'opacity-100 translate-x-0 translate-y-0' : hiddenByDirection[direction]
      } ${className}`}
    >
      {children}
    </div>
  );
}
