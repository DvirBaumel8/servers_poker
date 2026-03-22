import { useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "../stores/authStore";
import { getEmailValidationMessage, normalizeEmail } from "../utils/email";
import { normalizeRedirectPath } from "../utils/navigation";
import {
  AlertBanner,
  Button,
  PasswordField,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = normalizeRedirectPath(searchParams.get("redirectTo"));
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");

  const needsVerification =
    error?.toLowerCase().includes("verify") ||
    error?.toLowerCase().includes("verification");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    const emailValidationMessage = getEmailValidationMessage(normalizedEmail);

    if (emailValidationMessage) {
      setEmailTouched(true);
      return;
    }

    try {
      await login(normalizedEmail, password);
      navigate(redirectTo);
    } catch {
      // Error is handled in store
    }
  };

  const handleVerifyEmail = () => {
    clearError();
    navigate("/verify-email", { state: { email } });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <SurfaceCard className="space-y-8 p-8">
          <div className="space-y-3 text-center">
            <div className="eyebrow-label">Sign in</div>
            <h1 className="text-3xl font-display font-semibold text-white">
              Welcome back
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              Access your bot workspace, live tables, tournaments, and
              analytics.
            </p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <AlertBanner
                title="Sign in failed"
                dismissible
                onDismiss={clearError}
                helpLink="/forgot-password"
                helpText="Forgot password?"
              >
                <p>{error}</p>
                {needsVerification && (
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    className="mt-2 text-sm font-medium text-accent underline"
                  >
                    Go to verification page
                  </button>
                )}
              </AlertBanner>
            )}

            <TextField
              label="Email"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setEmail(e.target.value);
              }}
              onBlur={() => setEmailTouched(true)}
              required
              placeholder="you@example.com"
              error={
                emailTouched
                  ? (getEmailValidationMessage(email) ?? undefined)
                  : undefined
              }
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-slate-200"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-accent hover:text-accent-light"
                >
                  Forgot password?
                </Link>
              </div>
              <PasswordField
                id="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                required
                placeholder="••••••••"
                className="space-y-0"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="space-y-2 text-center text-sm text-slate-400">
            <p>Don't have an account?</p>
            <Link
              to={`/register${redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
              className="inline-flex items-center gap-2 font-medium text-accent underline decoration-accent/60 underline-offset-4 transition hover:text-accent-light hover:decoration-accent-light"
            >
              Sign up
            </Link>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
