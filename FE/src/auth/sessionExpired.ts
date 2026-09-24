/**
 * Session-expiry bridge between non-React code (Axios interceptors) and the
 * AuthProvider. Avoids a circular import and lets a failed token refresh
 * log the user out through React state instead of a hard page redirect.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionExpired(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function emitSessionExpired(): void {
  listeners.forEach((cb) => cb());
}
