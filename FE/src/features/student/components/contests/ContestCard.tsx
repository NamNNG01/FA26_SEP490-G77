import React from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import type { StudentContest } from "@/services/studentContest.service";
import {
  ctaFor,
  formatDate,
  startLabel,
  STATUS_ACCENT,
  StatusBadge,
} from "./contestHelpers";

export function ContestCard({
  contest,
  onOpen,
}: {
  contest: StudentContest;
  onOpen: () => void;
}) {
  const cta = ctaFor(contest);
  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit
    ? Math.min(100, Math.round((contest.registeredCount / contest.maxParticipants!) * 100))
    : 0;
  const isFull = hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md focus-within:shadow-md">
      <div
        className={`h-1 w-full ${STATUS_ACCENT[contest.status] ?? "bg-line"}`}
        aria-hidden="true"
      />

      <div className="relative">
        {contest.bannerUrl ? (
          <img src={contest.bannerUrl} alt="" className="h-36 w-full object-cover" />
        ) : (
          <div className="flex h-36 items-center justify-center bg-gradient-to-br from-primary-light to-surface-muted text-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface shadow-sm">
              <Icon.Trophy className="h-7 w-7" />
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-surface/90 p-0.5 shadow-sm backdrop-blur">
          <StatusBadge status={contest.status} />
        </div>
        {contest.isRegistered && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Icon.Check className="h-3.5 w-3.5" />
            Registered
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <h2
            className="line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-content"
            title={contest.title}
          >
            {contest.title}
          </h2>
          {contest.course && (
            <p className="truncate text-xs font-medium text-primary">{contest.course.title}</p>
          )}
          <p className="line-clamp-2 min-h-10 text-sm leading-5 text-content-soft">
            {contest.description ||
              "Join this contest to test your skills and compete with other students."}
          </p>
        </div>

        <div className="space-y-2 border-t border-line-soft pt-3 text-sm text-content-secondary">
          <p className="flex items-center gap-2">
            <Icon.Calendar className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="text-content-subtle">{startLabel(contest.status)}</span>
            <span className="font-medium text-content">{formatDate(contest.startTime)}</span>
          </p>
          <p className="flex items-center gap-2">
            <Icon.Clock className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="tabular-nums">{contest.durationMinutes} min</span>
            <span className="text-line" aria-hidden="true">
              |
            </span>
            <span className="tabular-nums">{contest.questionCount} questions</span>
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-content-subtle">
                {hasLimit ? "Spots filled" : "Participants"}
              </span>
              <span
                className={`font-semibold tabular-nums ${isFull ? "text-danger" : "text-content-secondary"}`}
              >
                {hasLimit
                  ? `${contest.registeredCount} / ${contest.maxParticipants}${isFull ? " · Full" : ""}`
                  : contest.registeredCount}
              </span>
            </div>
            {hasLimit && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fillPct}
                aria-label="Registration capacity"
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${isFull ? "bg-danger" : "bg-primary"}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            )}
          </div>
          <Button className="w-full" variant={cta.variant} onClick={onOpen}>
            {cta.label}
          </Button>
        </div>
      </div>
    </article>
  );
}
