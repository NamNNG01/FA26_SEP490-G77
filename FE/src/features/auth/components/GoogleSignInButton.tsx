import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { config } from '@/config';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { useToast } from '@/components/ui/ToastHost';

/**
 * AUTH-09: "Sign in with Google" via Google Identity Services.
 *
 * GIS renders Google's own button and hands back a signed ID token (the
 * `credential`), which is sent to POST /auth/google. That button is kept
 * invisible over an app-styled one so the page keeps its own look. The backend verifies it
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

// GIS accepts a pixel width between 200 and 400; the button is rendered at a
// fixed width and stretched with CSS to cover the visible one.
const GSI_WIDTH = 300;

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
  const buttonRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(Boolean(config.googleClientId));
  const [busy, setBusy] = useState(false);
  // Horizontal scale that makes the GIS button span the whole visible button,
  // so every pixel of it stays clickable.
  const [stretch, setStretch] = useState(1);

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
        el.replaceChildren();
        gsi.renderButton(el, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: GSI_WIDTH,
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
  }, [mode]);

  // Keep the invisible GIS button exactly as wide as ours as the layout changes.
  useEffect(() => {
    const slot = buttonRef.current?.parentElement;
    if (!slot) return;
    const observer = new ResizeObserver(([entry]) => setStretch(entry.contentRect.width / GSI_WIDTH));
    observer.observe(slot);
    return () => observer.disconnect();
  }, [available]);

  if (!available) return null;

  return (
    <div className="mt-5 [@media(max-height:850px)]:mt-4">
      <div className="flex items-center gap-3 mb-4 [@media(max-height:850px)]:mb-3">
        <span className="h-px flex-1 bg-line-soft" />
        <span className="text-xs uppercase tracking-wide text-content-soft">or</span>
        <span className="h-px flex-1 bg-line-soft" />
      </div>
      {/*
        GIS only hands out the ID token through its own button, so that button is
        laid invisibly over ours: the user sees the app's outline button but the
        click lands on Google's. :hover and :focus-within reach the wrapper from
        the iframe, which is what drives the group-* states below.
      */}
      <div
        className={`group relative h-10 w-full transition-opacity ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        aria-busy={busy}
      >
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center gap-2.5 rounded-[10px] border border-line bg-surface text-base font-medium text-content-secondary shadow-sm transition-all duration-150 group-hover:bg-surface-hover group-hover:border-line-strong group-focus-within:ring-2 group-focus-within:ring-brand-600/20"
        >
          {busy ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
          ) : (
            <GoogleLogo className="w-[18px] h-[18px]" />
          )}
          {mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
        </div>
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[10px] opacity-0">
          <div ref={buttonRef} className="shrink-0" style={{ transform: `scaleX(${stretch})` }} />
        </div>
      </div>
      {busy && (
        <p className="mt-2 text-center text-xs text-content-soft" role="status">
          Signing you in with Google…
        </p>
      )}
    </div>
  );
}

/** Google's four-colour "G"; its brand rules keep these colours on any background. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
