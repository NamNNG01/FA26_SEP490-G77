import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { DRAWIO_EMBED_URL, DRAWIO_ORIGIN } from '../diagram';

type DrawioMessage = { event?: string; xml?: string; data?: string };

/** draw.io normally says "init" within a few seconds; past this it isn't coming. */
const INIT_TIMEOUT_MS = 20000;

/**
 * draw.io in embed mode (JSON protocol). The editor keeps our copy of the XML
 * current through autosave; "Done" asks for an SVG snapshot, then closes.
 * If draw.io never reports "init" (offline, embed.diagrams.net blocked by a
 * network or extension, third-party storage blocked), the modal says so and
 * offers a retry instead of spinning forever.
 */
export function DrawioEditorModal({ open, xml, onClose, onSave }: {
  open: boolean;
  xml: string;
  onClose: () => void;
  onSave: (xml: string, svg: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const latestXml = useRef(xml);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  /** Bumped by "Try again" to load a fresh iframe. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    latestXml.current = xml;
    setReady(false);
    setFailed(false);
    setExporting(false);

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
      switch (msg?.event) {
        case 'init':
          clearTimeout(timer);
          post({ action: 'load', xml: latestXml.current, autosave: 1 });
          setFailed(false);
          setReady(true);
          break;
        case 'autosave':
        case 'save':
          if (typeof msg.xml === 'string') latestXml.current = msg.xml;
          break;
        case 'export':
          if (typeof msg.xml === 'string') latestXml.current = msg.xml;
          onSave(latestXml.current, typeof msg.data === 'string' ? msg.data : '');
          setExporting(false);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', handler);
    };
    // Load once per opening (or retry); later `xml` changes come from this editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  const done = () => {
    setExporting(true);
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ action: 'export', format: 'svg' }), DRAWIO_ORIGIN);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Model answer diagram"
      size="2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
          <Button onClick={done} disabled={!ready} loading={exporting}>Done</Button>
        </>
      }
    >
      <div className="relative h-[65vh] -mx-1 rounded-[10px] overflow-hidden border border-line bg-white">
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
                privacy extension or network firewall isn’t blocking diagrams.net, then try again.
              </p>
            </div>
            <Button variant="secondary" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setAttempt(a => a + 1)}>Try again</Button>
          </div>
        )}
        {open && <iframe key={attempt} ref={frameRef} src={DRAWIO_EMBED_URL} title="draw.io diagram editor" className="w-full h-full border-0" />}
      </div>
    </Modal>
  );
}
