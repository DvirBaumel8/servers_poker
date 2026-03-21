import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { authApi } from "../api/auth";
import { getEmailValidationMessage, normalizeEmail } from "../utils/email";
import {
  AlertBanner,
  Button,
  SurfaceCard,
  TextField,
} from "../components/ui/primitives";

export function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = location.state?.email || "";

  const [email, setEmail] = useState(emailFromState);
  const [emailTouched, setEmailTouched] = useState(false);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (emailFromState) {
      inputRefs.current[0]?.focus();
    }
  }, [emailFromState]);

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pastedData.length === 6) {
      setCode(pastedData.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const codeString = code.join("");
    const normalizedEmail = normalizeEmail(email);

    if (!emailFromState) {
      const emailValidationMessage = getEmailValidationMessage(normalizedEmail);
      if (emailValidationMessage) {
        setEmailTouched(true);
        setError(emailValidationMessage);
        return;
      }
    }

    if (codeString.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword({
        email: normalizedEmail,
        code: codeString,
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Please enter your email address");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    const emailValidationMessage = getEmailValidationMessage(normalizedEmail);
    if (emailValidationMessage) {
      setEmailTouched(true);
      setError(emailValidationMessage);
      return;
    }

    setResending(true);
    setError(null);

    try {
      await authApi.forgotPassword(normalizedEmail);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <SurfaceCard className="text-center">
            <div className="eyebrow-label">Password updated</div>
            <h1 className="mt-3 text-3xl font-display font-semibold text-white">
              Password reset successful
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Redirecting to login...
            </p>
          </SurfaceCard>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <SurfaceCard className="space-y-8 p-8">
          <div className="space-y-3 text-center">
            <div className="eyebrow-label">Reset password</div>
            <h1 className="text-3xl font-display font-semibold text-white">
              Enter your recovery code
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              Confirm the six-digit code and choose a new password.
            </p>
          </div>

          {error && (
            <AlertBanner
              dismissible
              onDismiss={() => setError(null)}
              title="Reset failed"
            >
              {error}
            </AlertBanner>
          )}

          <form noValidate onSubmit={handleSubmit} className="space-y-6">
            {!emailFromState ? (
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
            ) : (
              <div className="text-center text-sm text-slate-400">
                Code sent to <span className="text-accent">{email}</span>
              </div>
            )}

            <div>
              <label className="mb-2 block text-center text-sm font-medium text-slate-200">
                Reset code
              </label>
              <div className="flex justify-center gap-3" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={loading}
                    className="h-14 w-12 rounded-2xl border border-white/8 bg-surface-400 text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
                  />
                ))}
              </div>
            </div>

            <TextField
              label="New password"
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setNewPassword(e.target.value)
              }
              required
              minLength={8}
              placeholder="••••••••"
            />

            <TextField
              label="Confirm new password"
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setConfirmPassword(e.target.value)
              }
              required
              minLength={8}
              placeholder="••••••••"
            />

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <div className="text-center">
            <p className="mb-2 text-sm text-slate-400">
              Didn&apos;t receive the code?
            </p>
            <button
              onClick={handleResend}
              disabled={resending || loading}
              className="text-sm font-medium text-accent hover:text-accent-light disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend code"}
            </button>
          </div>

          <div className="border-t border-white/8 pt-6 text-center text-sm text-slate-400">
            Remember your password?{" "}
            <Link
              to="/login"
              className="font-medium text-accent hover:text-accent-light"
            >
              Back to login
            </Link>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
