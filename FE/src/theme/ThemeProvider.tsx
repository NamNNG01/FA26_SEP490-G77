import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * ThemeProvider — centralized theme manager.
 *
 * - Registered themes are listed in THEMES (add a theme by registering it
 *   here; nothing else needs to change).
 * - Persisted in localStorage under `theme`; restored on first load.
 * - Applied globally by toggling the theme class on <html> (class-based
 *   dark variant — see @custom-variant in styles/index.css).
 * - Exposes toggleTheme() which cycles Light -> Dark -> Light through ALL
 *   registered themes dynamically (no hardcoded names at call sites).
 */

/** Registered themes. Extend this list to add more. */
export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Persisted preference. 'system' follows the OS setting. */
export type ThemePreference = Theme | 'system';

const THEME_KEY = 'theme';

function readStoredPreference(): ThemePreference {
  const raw = localStorage.getItem(THEME_KEY);
  return (THEMES as readonly string[]).includes(raw ?? '')
    ? (raw as Theme)
    : 'system';
}

/** Resolve a preference against the OS setting to a concrete theme. */
function resolveTheme(pref: ThemePreference): Theme {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(resolved: Theme) {
  const root = document.documentElement;
  THEMES.forEach((t) => root.classList.remove(t));
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: Theme;
  setPreference: (pref: ThemePreference) => void;
  /** Advance to the next registered theme immediately. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(),
  );
  const [resolved, setResolved] = useState<Theme>(() =>
    resolveTheme(readStoredPreference()),
  );

  // Apply on mount and whenever the preference changes.
  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyTheme(next);
  }, [preference]);

  // 'system' follows the OS live.
  useEffect(() => {
    if (preference !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyTheme(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [preference]);

  function setPreference(pref: ThemePreference) {
    localStorage.setItem(THEME_KEY, pref);
    setPreferenceState(pref);
  }

  /**
   * Cycle to the next registered theme (dynamic — no hardcoded names).
   * 'system' resolves to a concrete theme first, then advances.
   */
  function toggleTheme() {
    const idx = THEMES.indexOf(resolved);
    const next = THEMES[(idx + 1) % THEMES.length];
    setPreference(next);
  }

  return (
    <ThemeContext.Provider
      value={{ preference, resolved, setPreference, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
