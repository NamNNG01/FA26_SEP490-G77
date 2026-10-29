import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/assets/icons';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import {
  CODE_LANGUAGE_LABEL,
  DECK_MODE_LABEL,
  type CodeLanguage,
  type DeckMode,
  type ReviewStatus,
} from '@/services/studentDeck.service';

export const TEXTAREA_CLASS =
  'w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-base text-content placeholder:text-content-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600';
export const CODE_TEXTAREA_CLASS = `${TEXTAREA_CLASS} font-mono text-sm leading-relaxed`;

const REVIEW_BADGE: Record<ReviewStatus, { label: string; variant: 'default' | 'warning' | 'success' | 'danger'; icon: React.ReactNode }> = {
  NONE: { label: 'Private', variant: 'default', icon: <Icon.Lock className="w-3 h-3" /> },
  PENDING_REVIEW: { label: 'Pending review', variant: 'warning', icon: <Icon.Clock className="w-3 h-3" /> },
  APPROVED: { label: 'Public', variant: 'success', icon: <Icon.Eye className="w-3 h-3" /> },
  REJECTED: { label: 'Rejected', variant: 'danger', icon: <Icon.XCircle className="w-3 h-3" /> },
};

export function DeckStatusBadge({ status }: { status: ReviewStatus }) {
  const b = REVIEW_BADGE[status] ?? REVIEW_BADGE.NONE;
  return (
    <Badge size="sm" variant={b.variant}>
      {b.icon} {b.label}
    </Badge>
  );
}

export function DeckModeBadge({ mode }: { mode: DeckMode | null | undefined }) {
  if (!mode) return null;
  return (
    <Badge size="sm" variant="info">
      {DECK_MODE_LABEL[mode] ?? mode}
    </Badge>
  );
}

/** Monospace code with its language on top (no syntax colouring). */
export function CodeBlock({ code, language, className = '' }: { code: string; language?: CodeLanguage | null; className?: string }) {
  return (
    <div className={`w-full min-w-0 rounded-[10px] border border-line bg-surface-alt text-left overflow-hidden ${className}`}>
      {language && (
        <div className="px-3 py-1.5 border-b border-line text-2xs font-semibold uppercase tracking-wide text-content-subtle">
          {CODE_LANGUAGE_LABEL[language] ?? language}
        </div>
      )}
      <pre className="px-3 py-2.5 text-sm font-mono text-content whitespace-pre overflow-x-auto max-h-80">{code}</pre>
    </div>
  );
}

export interface CardContent {
  frontText: string;
  backText: string;
  codeLanguage: CodeLanguage | null;
  codeBody: string | null;
}

/** What one face of a card shows, by deck mode: CODE_SNIPPET puts the code on the back, CODE_OUTPUT on the front. */
export function CardFace({ card, mode, side }: { card: CardContent; mode: DeckMode; side: 'front' | 'back' }) {
  const text = (t: string) => (
    <p className="text-[clamp(1rem,0.95rem+0.4vw,1.25rem)] font-medium text-content whitespace-pre-line break-words">{t}</p>
  );
  const code = card.codeBody ? <CodeBlock code={card.codeBody} language={card.codeLanguage} /> : null;
  if (mode === 'CODE_SNIPPET') return side === 'front' ? text(card.frontText) : code ?? text(card.backText);
  if (mode === 'CODE_OUTPUT') {
    if (side === 'front') return code ?? text(card.frontText);
    return (
      <div className="w-full space-y-1.5 text-left">
        <p className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">Output</p>
        <pre className="rounded-[10px] bg-surface-alt border border-line px-3 py-2.5 text-sm font-mono text-content whitespace-pre-wrap break-words">
          {card.backText}
        </pre>
      </div>
    );
  }
  return text(side === 'front' ? card.frontText : card.backText);
}

/** The student's ACTIVE courses (MC-01 has no "all" size, so walk its pages). */
export function useActiveCourses() {
  const [courses, setCourses] = useState<MyCourse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all: MyCourse[] = [];
        for (let page = 0; ; page++) {
          const res = await studentCourseService.getMyCourses({ status: 'ACTIVE', page, size: 100 });
          all.push(...res.content);
          if (res.last || res.content.length === 0) break;
        }
        if (!cancelled) setCourses(all);
      } catch {
        if (!cancelled) {
          setCourses([]);
          setError('Could not load your courses.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { courses, error };
}

/** Yes / no dialog for destructive or one-way actions. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      size="sm"
      title={title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-content-soft">{message}</div>
    </Modal>
  );
}

/** "1 card" / "3 cards". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
