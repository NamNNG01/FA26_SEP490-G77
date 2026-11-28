import { useEffect, useRef } from "react";

/**
 * One shared clock that asks every subscribed page to read its data again, so lists and dashboards
 * stay current without a manual Refresh.
 *
 * - A single timer serves the whole app; it only runs while at least one page is subscribed.
 * - Never while the tab is hidden: a hidden tab catches up as soon as it is shown again.
 * - Never while the user is busy (a dialog is open, or a text field / select has focus): the tick
 *   is held and fires once they are done, so no draft or open dialog is disturbed.
 * - Subscribers must refresh quietly — no loader, no reset of page, filters or scroll.
 */

/** One tick of the shared clock: lists refresh every tick. */
export const AUTO_REFRESH_MS = 30_000;
/** Heavier aggregate reads (dashboards) refresh every second tick. */
export const DASHBOARD_REFRESH_MS = 60_000;
/** How often a held tick checks whether the user is done. */
const RESUME_CHECK_MS = 1_000;
/** Random start offset per tab, so many open tabs do not hit the server in the same second. */
const MAX_JITTER_MS = 5_000;

type Listener = () => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let startDelay: ReturnType<typeof setTimeout> | null = null;
let resumeTimer: ReturnType<typeof setInterval> | null = null;
let lastRun = Date.now();

function isUserBusy(): boolean {
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return true;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function canRun(): boolean {
  return document.visibilityState === "visible" && !isUserBusy();
}

function run() {
  stopResumeCheck();
  lastRun = Date.now();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // One page failing must not stop the others.
    }
  });
}

function stopResumeCheck() {
  if (resumeTimer) clearInterval(resumeTimer);
  resumeTimer = null;
}

/** A tick came while the user was busy: fire as soon as they are not. */
function holdUntilIdle() {
  if (resumeTimer) return;
  resumeTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    if (!isUserBusy()) run();
  }, RESUME_CHECK_MS);
}

function tick() {
  if (canRun()) run();
  else if (document.visibilityState === "visible") holdUntilIdle();
  // Hidden: onVisibilityChange catches up.
}

function onVisibilityChange() {
  if (document.visibilityState !== "visible") {
    stopResumeCheck();
    return;
  }
  if (Date.now() - lastRun >= AUTO_REFRESH_MS) tick();
}

function start() {
  lastRun = Date.now();
  startDelay = setTimeout(() => {
    startDelay = null;
    timer = setInterval(tick, AUTO_REFRESH_MS);
  }, Math.random() * MAX_JITTER_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function stop() {
  if (startDelay) clearTimeout(startDelay);
  startDelay = null;
  if (timer) clearInterval(timer);
  timer = null;
  stopResumeCheck();
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

/** Subscribes `listener` to the shared clock; returns the unsubscribe. */
export function subscribeAutoRefresh(listener: Listener): () => void {
  listeners.add(listener);
  if (!timer && !startDelay) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

/**
 * Calls `refresh` on the shared clock while the component is mounted and `enabled` is true:
 * every `intervalMs` (a multiple of AUTO_REFRESH_MS; default every tick).
 * `refresh` must re-read quietly (keep what is on screen until the new data arrives).
 */
export function useAutoRefresh(
  refresh: () => void,
  enabled = true,
  intervalMs = AUTO_REFRESH_MS,
): void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const everyTicks = Math.max(1, Math.round(intervalMs / AUTO_REFRESH_MS));
  useEffect(() => {
    if (!enabled) return;
    let ticks = 0;
    return subscribeAutoRefresh(() => {
      ticks += 1;
      if (ticks % everyTicks === 0) refreshRef.current();
    });
  }, [enabled, everyTicks]);
}

/**
 * For pages that read in an effect keyed on a reload counter: subscribes `reload` to the shared
 * clock and returns `takeQuiet()`, which the read calls once at its start — true when the read
 * came from the clock, so it must not show a loader or replace the page with an error.
 */
export function useQuietRefresh(
  reload: () => void,
  enabled = true,
  intervalMs = AUTO_REFRESH_MS,
): () => boolean {
  const quietRef = useRef(false);
  useAutoRefresh(
    () => {
      quietRef.current = true;
      reload();
    },
    enabled,
    intervalMs,
  );
  const takeRef = useRef(() => {
    const quiet = quietRef.current;
    quietRef.current = false;
    return quiet;
  });
  return takeRef.current;
}
