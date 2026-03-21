import { useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { getEmailValidationMessage, normalizeEmail } from "../utils/email";
import {
  AlertBanner,
  Button,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = normalizeEmail(email);
    const emailValidationMessage = getEmailValidationMessage(normalizedEmail);

    if (emailValidationMessage) {
      setEmailTouched(true);
      setError(emailValidationMessage);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authApi.forgotPassword(normalizedEmail);
      setSuccess(true);
      setTimeout(() => {
        navigate("/reset-password", { state: { email: normalizedEmail } });
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send reset code",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <SurfaceCard className="space-y-8 p-8">
          <div className="space-y-3 text-center">
            <div className="eyebrow-label">Password recovery</div>
            <h1 className="text-3xl font-display font-semibold text-white">
              Forgot password?
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              Enter your email and we&apos;ll send a reset code if an account
              exists.
            </p>
          </div>

          {error && (
            <AlertBanner
              dismissible
              onDismiss={() => setError(null)}
              title="Reset request failed"
            >
              {error}
            </AlertBanner>
          )}

          {success ? (
            <div className="text-center">
              <AlertBanner tone="success" title="Reset code sent">
                If an account exists with this email, a reset code has been
                sent.
              </AlertBanner>
              <AlertBanner
                tone="info"
                className="mt-4 text-left"
                title="Local development note"
              >
                If SMTP is not configured, the backend logs the reset code
                instead of sending an email.
              </AlertBanner>
              <p className="mt-4 text-gray-400">Redirecting to reset page...</p>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="space-y-6">
              <TextField
                label="Email address"
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
                  emailTouched
                    ? (getEmailValidationMessage(email) ?? undefined)
                    : undefined
                }
              />

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Sending..." : "Send Reset Code"}
              </Button>
            </form>
          )}

          <div className="border-t border-white/8 pt-6 text-center text-sm text-slate-400">
            <p>
              Remember your password?{" "}
              <Link
                to="/login"
                className="font-medium text-accent hover:text-accent-light"
              >
                Back to login
              </Link>
            </p>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
