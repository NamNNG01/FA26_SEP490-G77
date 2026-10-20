import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { DRAWIO_EMBED_URL, DRAWIO_ORIGIN } from '../diagram';

type DrawioMessage = { event?: string; xml?: string; data?: string };

/**
 * draw.io in embed mode (JSON protocol). The editor keeps our copy of the XML
 * current through autosave; "Done" asks for an SVG snapshot, then closes.
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
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    latestXml.current = xml;
    setReady(false);
    setExporting(false);

    const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);

    const handler = (e: MessageEvent) => {
      if (e.origin !== DRAWIO_ORIGIN || e.source !== frameRef.current?.contentWindow || typeof e.data !== 'string') return;
      let msg: DrawioMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.event) {
        case 'init':
          post({ action: 'load', xml: latestXml.current, autosave: 1 });
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
    return () => window.removeEventListener('message', handler);
    // Load once per opening; later `xml` changes come from this editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-content-soft">
            <Spinner size="sm" /> Loading draw.io…
          </div>
        )}
        {open && <iframe ref={frameRef} src={DRAWIO_EMBED_URL} title="draw.io diagram editor" className="w-full h-full border-0" />}
      </div>
    </Modal>
  );
}
