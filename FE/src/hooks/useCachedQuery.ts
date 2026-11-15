import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A small in-memory cache for read-only pages the student keeps coming back to (course, module,
 * exam, deck…): a page opened again shows what it read last time at once, and reads it again in the
 * background (stale-while-revalidate), so the numbers are always brought up to date.
 *
 * It lives in this tab's memory only — gone on reload or when the tab closes — and is emptied on
 * every sign-in / sign-out (clearQueryCache), so one account never sees another's data.
 */

const MAX_ENTRIES = 50;
/**
 * An entry written this recently counts as fresh and is not read again on mount: it was just read
 * (or handed over by the page that just read it). It also covers StrictMode's second effect run.
 */
const FRESH_MS = 2000;
const cache = new Map<string, { value: unknown; at: number }>();
/** Reads under way, so two readers of one key (or StrictMode's second effect run) share one request. */
const inflight = new Map<string, Promise<unknown>>();

/** Bumped by clearQueryCache: a read started before a sign-out must not fill the new session's cache. */
let generation = 0;

/** For a fetcher that also caches other keys: take it before reading, write only while it is current. */
export function cacheGeneration(): number {
  return generation;
}

function read<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const gen = generation;
  const p = fetcher()
    .then(value => {
      if (gen === generation) setCached(key, value);
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

export function getCached<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

function isFresh(key: string): boolean {
  const entry = cache.get(key);
  return entry != null && Date.now() - entry.at < FRESH_MS;
}

export function setCached<T>(key: string, value: T): void {
  // Re-insert so the Map's order is least recently written first, and drop the oldest past the cap.
  cache.delete(key);
  cache.set(key, { value, at: Date.now() });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/** Drops one entry, or every entry whose key starts with `prefix` when it ends with ':'. */
export function invalidateCached(keyOrPrefix: string): void {
  if (!keyOrPrefix.endsWith(':')) {
    cache.delete(keyOrPrefix);
    return;
  }
  for (const key of [...cache.keys()]) if (key.startsWith(keyOrPrefix)) cache.delete(key);
}

export function clearQueryCache(): void {
  generation++;
  cache.clear();
  inflight.clear();
}

export interface CachedQuery<T> {
  /** The cached value at once, then the fresh one; undefined until the first read. */
  data: T | undefined;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  /** Set only when the read failed and there is nothing cached to show instead. */
  error: unknown;
  /** Reads it again (showing the loader only when nothing is cached). */
  reload: () => void;
  /** Replaces the value here and in the cache, e.g. after a local edit. */
  setData: (update: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Reads `fetcher()` under `key` (null = do not read), unless the cached value is fresh (FRESH_MS).
 * `initialData`, when given, is cached on the first render as just read (e.g. data handed over in
 * router state by the page that just read it), so it is shown without reading; `reload` always reads.
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { initialData?: T } = {},
): CachedQuery<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  // initialData is taken once, on the first render.
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    if (key != null && options.initialData !== undefined) setCached(key, options.initialData);
  }

  // State is tagged with its key, so after a key change nothing of the previous key shows.
  type Entry = { key: string | null; data: T | undefined; error: unknown };
  const fromCache = (k: string | null): Entry => ({ key: k, data: k == null ? undefined : getCached<T>(k), error: null });
  const [entry, setEntry] = useState<Entry>(() => fromCache(key));
  const [tick, setTick] = useState(0);
  const current = entry.key === key ? entry : fromCache(key);

  useEffect(() => {
    if (key == null) return;
    setEntry(fromCache(key));
    if (tick === 0 && isFresh(key)) return;
    let cancelled = false;
    read(key, fetcherRef.current)
      .then(value => {
        if (!cancelled) setEntry({ key, data: value, error: null });
      })
      .catch(err => {
        // With something cached the page keeps showing it; the next visit tries again.
        if (!cancelled && getCached<T>(key) === undefined) setEntry({ key, data: undefined, error: err ?? new Error('Request failed') });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => setTick(t => t + 1), []);
  const setData = useCallback(
    (update: T | ((prev: T | undefined) => T)) => {
      setEntry(prev => {
        const base = prev.key === key ? prev.data : key == null ? undefined : getCached<T>(key);
        const next = typeof update === 'function' ? (update as (p: T | undefined) => T)(base) : update;
        if (key != null) setCached(key, next);
        return { key, data: next, error: null };
      });
    },
    [key],
  );

  return {
    data: current.data,
    loading: key != null && current.data === undefined && current.error == null,
    error: current.error,
    reload,
    setData,
  };
}
