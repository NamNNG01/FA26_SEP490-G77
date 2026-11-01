import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { config } from '@/config';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { useToast } from '@/components/ui/ToastHost';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * AUTH-09: "Sign in with Google" via Google Identity Services.
 *
 * GIS renders Google's own button and hands back a signed ID token (the
 * `credential`), which is sent to POST /auth/google. The backend verifies it
 * and returns the usual access/refresh pair, so the rest of the app treats the
 * session exactly like a password login.
 *
 * Renders nothing while VITE_GOOGLE_CLIENT_ID is blank or the GIS script
 * cannot load (e.g. blocked by an extension), so the email form still works.
 */

interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

interface GsiIdApi {
  initialize: (cfg: {
    client_id: string;
    callback: (res: { credential?: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: GsiButtonOptions) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiIdApi } };
  }
}

// `hl` pins the button text to the app's language; the renderButton `locale`
// option alone is ignored when the browser prefers another language.
const GSI_SRC = 'https://accounts.google.com/gsi/client?hl=en';
let gsiLoading: Promise<GsiIdApi> | null = null;

/** Load the GIS script once per page; later calls reuse the same promise. */
function loadGsi(): Promise<GsiIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (gsiLoading) return gsiLoading;

  gsiLoading = new Promise<GsiIdApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.google?.accounts?.id
        ? resolve(window.google.accounts.id)
        : reject(new Error('Google Identity Services did not initialise.'));
    script.onerror = () => {
      script.remove();
      reject(new Error('Could not load Google Identity Services.'));
    };
    document.head.appendChild(script);
  }).catch((err) => {
    gsiLoading = null; // allow a retry on the next mount
    throw err;
  });
  return gsiLoading;
}

// GIS accepts a pixel width between 200 and 400.
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

interface GoogleSignInButtonProps {
  /** "Sign in with Google" on Login, "Sign up with Google" on Register. */
  mode: 'signin' | 'signup';
  /** Where to go after signing in; defaults to the role's landing page. */
  redirectTo?: string | null;
  /** Called before the backend call so the page can clear its old error. */
  onStart?: () => void;
  /** Called with a user-facing message when Google sign-in fails. */
  onError: (message: string) => void;
}

export function GoogleSignInButton({ mode, redirectTo, onStart, onError }: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { resolved: theme } = useTheme();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(Boolean(config.googleClientId));
  const [busy, setBusy] = useState(false);

  // GIS keeps the callback passed to initialize(); route it through a ref so it
  // always sees the latest props instead of the ones from the first render.
  const handleCredentialRef = useRef<(idToken: string) => void>(() => {});
  handleCredentialRef.current = async (idToken: string) => {
    onStart?.();
    setBusy(true);
    try {
      const { user, newUser } = await loginWithGoogle(idToken);
      if (newUser) {
        toast.success(`Welcome to ${config.appName}, ${user.fullName}! Your account has been created.`);
      }
      navigate(redirectTo ?? landingPathForRole(user.role), { replace: true });
    } catch (err: unknown) {
      setBusy(false);
      onError(err instanceof Error ? err.message : 'Google sign-in failed. Please try again.');
    }
  };

  useEffect(() => {
    if (!config.googleClientId) return;
    let cancelled = false;

    loadGsi()
      .then((gsi) => {
        const el = buttonRef.current;
        if (cancelled || !el) return;
        gsi.initialize({
          client_id: config.googleClientId,
          callback: (res) => {
            if (res.credential) void handleCredentialRef.current(res.credential);
          },
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        const width = Math.round(
          Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, el.parentElement?.clientWidth ?? MAX_WIDTH)),
        );
        el.replaceChildren();
        gsi.renderButton(el, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width,
          locale: 'en',
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[GoogleSignInButton]', err);
        setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, theme]);

  if (!available) return null;

  return (
    <div className="mt-5 [@media(max-height:850px)]:mt-4">
      <div className="flex items-center gap-3 mb-4 [@media(max-height:850px)]:mb-3">
        <span className="h-px flex-1 bg-line-soft" />
        <span className="text-xs uppercase tracking-wide text-content-soft">or</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>
      <div
        className={`flex justify-center min-h-[44px] transition-opacity ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        aria-busy={busy}
      >
        <div ref={buttonRef} />
      </div>
      {busy && (
        <p className="mt-2 text-center text-xs text-content-soft" role="status">
          Signing you in with Google…
        </p>
      )}
    </div>
  );
}
