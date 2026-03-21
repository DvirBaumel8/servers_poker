import { useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { authApi } from "../api/auth";
import { getEmailValidationMessage, normalizeEmail } from "../utils/email";
import { normalizeRedirectPath } from "../utils/navigation";
import {
  AlertBanner,
  Button,
  PasswordField,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = normalizeRedirectPath(searchParams.get("redirectTo"));
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalizedEmail = normalizeEmail(email);
    const emailValidationMessage = getEmailValidationMessage(normalizedEmail);

    if (emailValidationMessage) {
      setEmailTouched(true);
      setError(emailValidationMessage);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.register({
        email: normalizedEmail,
        username,
        password,
      });
      if (response.requiresVerification) {
        navigate("/verify-email", {
          state: {
            email: normalizedEmail,
            devVerificationCode: response.verificationCode,
            redirectTo,
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  const clearError = () => setError(null);
  const normalizedEmail = normalizeEmail(email);
  const canRecoverExistingEmail =
    !!normalizedEmail &&
    !!error &&
    error.toLowerCase().includes("email already registered");
  const goToVerification = () => {
    clearError();
    navigate("/verify-email", {
      state: {
        email: normalizedEmail,
        redirectTo,
      },
    });
  };

  const displayError = error;

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <SurfaceCard className="space-y-8 p-8">
          <div className="space-y-3 text-center">
            <div className="eyebrow-label">Create workspace</div>
            <h1 className="text-3xl font-display font-semibold text-white">
              Join the arena
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              Set up your account and start deploying bots into live poker
              traffic.
            </p>
          </div>

          <form noValidate onSubmit={handleSubmit} className="space-y-5">
            {displayError && (
              <AlertBanner
                dismissible
                onDismiss={clearError}
                title="Registration failed"
              >
                <div className="space-y-3">
                  <p>{displayError}</p>
                  {canRecoverExistingEmail && (
                    <button
                      type="button"
                      onClick={goToVerification}
                      className="inline-flex items-center gap-2 font-medium text-accent underline decoration-accent/60 underline-offset-4 transition hover:text-accent-light hover:decoration-accent-light"
                    >
                      Go to verification page
                    </button>
                  )}
                </div>
              </AlertBanner>
            )}

            <TextField
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setEmail(e.target.value);
              }}
              onBlur={() => setEmailTouched(true)}
              required
              placeholder="you@example.com"
              error={
                emailTouched ? (getEmailValidationMessage(email) ?? undefined) : undefined
              }
            />
            <TextField
              label="Display name"
              id="username"
              type="text"
              value={username}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setUsername(e.target.value)
              }
              required
              placeholder="Baumal"
              hint="Shown in your workspace and across the product. This is not a unique login handle."
            />
            <PasswordField
              label="Password"
              id="password"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setPassword(e.target.value)
              }
              required
              minLength={8}
              placeholder="••••••••"
            />
            <PasswordField
              label="Confirm password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
              required
              placeholder="••••••••"
            />

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? "Creating account..." : "Create Account"}
            </Button>
          </form>

          <div className="space-y-2 text-center text-sm text-slate-400">
            <p>Already have an account?</p>
            <Link
              to={`/login${redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
              className="inline-flex items-center gap-2 font-medium text-accent underline decoration-accent/60 underline-offset-4 transition hover:text-accent-light hover:decoration-accent-light"
            >
              Sign in
            </Link>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
