import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { DRAWIO_EMBED_URL, DRAWIO_ORIGIN, hasDiagramContent } from '@/features/question/diagram';
import type { AnswerResponse } from '@/services/studentAttempt.service';

/** draw.io normally says "init" within a few seconds; past this it isn't coming. */
const INIT_TIMEOUT_MS = 20000;

type DrawioMessage = { event?: string; xml?: string };

/**
 * DIAGRAM answer: draw.io embedded right in the paper (embed mode, JSON
 * protocol). Every edit comes back through autosave and is emitted as
 * `{ drawioXml }`, so the take screen's draft autosave picks it up like any
 * other answer. A diagram with no shape counts as no answer. If draw.io
 * can't load (offline, embed.diagrams.net blocked), the student can retry or
 * fall back to pasting the XML.
 */
export function DiagramAnswerInput({
  value,
  onChange,
  roomy,
}: {
  value: AnswerResponse | null;
  onChange: (next: AnswerResponse) => void;
  roomy?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const xml = value?.drawioXml ?? '';
  // The handler outlives renders: read the latest props through refs.
  const lastXml = useRef(xml);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  /** Bumped by "Try again" to load a fresh iframe. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (pasteMode) return;
    setReady(false);
    setFailed(false);
    const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);
    const timer = setTimeout(() => setFailed(true), INIT_TIMEOUT_MS);

    const handler = (e: MessageEvent) => {
      if (e.origin !== DRAWIO_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
      let msg: DrawioMessage;
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg?.event === 'init') {
        clearTimeout(timer);
        post({ action: 'load', xml: lastXml.current, autosave: 1 });
        setFailed(false);
        setReady(true);
      } else if ((msg?.event === 'autosave' || msg?.event === 'save') && typeof msg.xml === 'string') {
        const next = hasDiagramContent(msg.xml) ? msg.xml : '';
        if (next === lastXml.current) return;
        lastXml.current = next;
        onChangeRef.current({ drawioXml: next });
      }
    };
    window.addEventListener('message', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };
  }, [attempt, pasteMode]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else wrapRef.current?.requestFullscreen().catch(() => undefined);
  };

  if (pasteMode) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-content-subtle">
            Paste the draw.io XML of your diagram (in diagrams.net: Extras → Edit Diagram).
          </p>
          <Button size="sm" variant="outline" icon={<Icon.Layers className="w-4 h-4" />} onClick={() => setPasteMode(false)}>
            Back to the draw.io editor
          </Button>
        </div>
        <textarea
          aria-label="Your diagram as draw.io XML"
          value={xml}
          onChange={e => {
            lastXml.current = e.target.value;
            onChange({ drawioXml: e.target.value });
          }}
          placeholder="<mxfile>…</mxfile>"
          spellCheck={false}
          className={`w-full resize-y rounded-[10px] border border-line bg-surface px-3 py-2.5 font-mono text-sm text-content placeholder:text-content-subtle focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 ${
            roomy ? 'min-h-[50vh]' : 'min-h-[14rem]'
          }`}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-subtle">
          Draw your answer below — it is saved automatically as you go.
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon.Layers className="w-4 h-4" />}
          onClick={toggleFullscreen}
          disabled={!ready}
        >
          Full screen
        </Button>
      </div>
      <div
        ref={wrapRef}
        className={`relative overflow-hidden border border-line bg-white ${
          fullscreen ? 'h-screen w-screen' : `rounded-[10px] ${roomy ? 'h-[68vh]' : 'h-[520px]'} min-h-[360px]`
        }`}
      >
        {fullscreen && (
          <div className="absolute right-3 bottom-3 z-10">
            <Button size="sm" onClick={toggleFullscreen}>
              Exit full screen
            </Button>
          </div>
        )}
        {!ready && !failed && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-content-soft pointer-events-none">
            <Spinner size="sm" /> Loading draw.io…
          </div>
        )}
        {failed && !ready && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
            <Icon.AlertCircle className="w-6 h-6 text-warning" />
            <div>
              <p className="text-base font-medium text-content">draw.io didn’t load</p>
              <p className="mt-1 max-w-md text-sm text-content-soft">
                The editor at embed.diagrams.net didn’t respond. Check your internet connection, and that an ad blocker,
                privacy extension or network firewall isn’t blocking diagrams.net.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setAttempt(a => a + 1)}>
                Try again
              </Button>
              <Button variant="outline" onClick={() => setPasteMode(true)}>
                Paste XML instead
              </Button>
            </div>
          </div>
        )}
        {/* no-referrer: embed.diagrams.net answers 403 to a localhost/127.0.0.1 Referer. */}
        <iframe
          key={attempt}
          ref={frameRef}
          src={DRAWIO_EMBED_URL}
          referrerPolicy="no-referrer"
          title="draw.io diagram editor"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
