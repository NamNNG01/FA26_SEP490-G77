import React, { useEffect, useRef, useState } from 'react';
import { DRAWIO_EMBED_URL, DRAWIO_ORIGIN, lightSvgDataUri } from '../diagram';

/** Past this, draw.io isn't coming (offline, blocked) — show the fallback. */
const TIMEOUT_MS = 20000;

/** SVG snapshots already rendered this session, by XML — reopening a question doesn't render again. */
const cache = new Map<string, string>();

export type SnapshotState = { svg: string; status: 'idle' | 'loading' | 'done' | 'failed' };

/**
 * Renders draw.io XML to an SVG data URI with a hidden draw.io (embed mode):
 * load the XML, ask for an SVG export. The backend keeps only the XML, so a
 * saved diagram has no picture until something renders it. Pass `xml = ''`
 * to skip. Render the returned `frame` somewhere in the tree while loading.
 */
export function useDrawioSnapshot(xml: string): SnapshotState & { frame: React.ReactNode } {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SnapshotState>(() =>
    !xml ? { svg: '', status: 'idle' } : cache.has(xml) ? { svg: cache.get(xml)!, status: 'done' } : { svg: '', status: 'loading' },
  );

  useEffect(() => {
    if (!xml) { setState({ svg: '', status: 'idle' }); return; }
    const cached = cache.get(xml);
    if (cached) { setState({ svg: cached, status: 'done' }); return; }
    setState({ svg: '', status: 'loading' });

    const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);
    const timer = setTimeout(() => setState({ svg: '', status: 'failed' }), TIMEOUT_MS);
    const handler = (e: MessageEvent) => {
      if (e.origin !== DRAWIO_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      let msg: { event?: string; data?: string };
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg?.event === 'init') {
        post({ action: 'load', xml });
        post({ action: 'export', format: 'svg' });
      } else if (msg?.event === 'export') {
        clearTimeout(timer);
        if (typeof msg.data === 'string' && msg.data) {
          const svg = lightSvgDataUri(msg.data);
          cache.set(xml, svg);
          setState({ svg, status: 'done' });
        } else {
          setState({ svg: '', status: 'failed' });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };
  }, [xml]);

  // Off-screen rather than display:none — draw.io needs a laid-out window to export.
  // no-referrer: embed.diagrams.net answers 403 to a localhost/127.0.0.1 Referer.
  const frame = state.status === 'loading' ? (
    <iframe
      key={xml}
      ref={frameRef}
      src={DRAWIO_EMBED_URL}
      referrerPolicy="no-referrer"
      title="draw.io diagram renderer"
      aria-hidden="true"
      tabIndex={-1}
      className="fixed -left-[10000px] top-0 w-[800px] h-[600px] border-0 pointer-events-none"
    />
  ) : null;

  return { ...state, frame };
}
