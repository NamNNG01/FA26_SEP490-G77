import React, { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { useAuth, landingPathForRole } from "@/auth/authContext";
import { AuthPageHeader } from "../components/AuthPageHeader";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { safeRedirect, withRedirectTarget } from "@/hooks/useRequireAuth";

/**
 * Router state LoginPage understands:
 *   from          — where to go after signing in (set by the route guard)
 *   email         — prefill (e.g. coming back from Forgot / Reset password)
 *   passwordReset — show the "password updated" banner after AUTH-07
 *   sessionChanged — the stored session was rejected on boot / refresh
 *
 * `?redirect=` (useRequireAuth) also says where to go after signing in; it is
 * passed on to Register so a learner who creates an account still comes back.
 */
type LoginLocationState = {
  from?: string;
  email?: string;
  passwordReset?: boolean;
  sessionChanged?: boolean;
} | null;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LoginLocationState;
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));

  const [email, setEmail] = useState(locationState?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // Auth state is updated at this point (login() sets it before
      // resolving) — only NOW navigate, so the router renders the
      // authenticated branch in the same commit. Use the FRESH user
      // returned by login(); the context value in this closure is stale.
      const loggedInUser = await login(email, password);
      const from = redirectTo ?? locationState?.from;
      navigate(from ?? landingPathForRole(loggedInUser.role), {
        replace: true,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Authentication failed. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-col">
        <div className="mb-4">
          <AuthPageHeader
            title="Welcome back"
            subtitle="Sign in to continue your exam prep"
          />
        </div>

        <div className="card p-6 [@media(max-height:850px)]:p-5 shadow-lg">
          <div className="mb-4">
            {error && (
              <Alert
                type="error"
                title="Authentication failed"
                message={error}
              />
            )}
            {!error && locationState?.passwordReset && (
              <Alert
                type="success"
                title="Password updated"
                message="Sign in with your new password. All other sessions have been signed out."
              />
            )}
            {!error && locationState?.sessionChanged && (
              <Alert
                type="warning"
                title="Please sign in again"
                message="Your session has expired or your account details have changed."
              />
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-[18px] [@media(max-height:850px)]:space-y-3.5"
          >
            <Input
              label="Email"
              placeholder="you@example.com"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Icon.Mail className="w-4 h-4" />}
            />
            <Input
              label="Password"
              labelAction={
                <button
                  type="button"
                  onClick={() =>
                    navigate(ROUTES.forgotPassword, {
                      state: { email: email.trim() },
                    })
                  }
                  className="text-xs text-brand-ink hover:underline font-medium"
                >
                  Forgot password?
                </button>
              }
              placeholder="Enter your password"
              autoComplete="current-password"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Icon.Lock className="w-4 h-4" />}
              suffix={
                <button
                  type="button"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  onClick={() => setShowPwd((s) => !s)}
                  className="hover:text-content-secondary transition-colors"
                >
                  {showPwd ? (
                    <Icon.EyeOff className="w-4 h-4" />
                  ) : (
                    <Icon.Eye className="w-4 h-4" />
                  )}
                </button>
              }
            />
            <Button className="w-full" loading={loading} type="submit">
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-line-soft flex justify-center">
            <p className="text-sm text-content-soft flex items-center gap-2">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => navigate(withRedirectTarget(ROUTES.register, redirectTo))}
                className="text-sm text-brand-ink hover:underline font-medium cursor-pointer"
              >
                Create one
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
