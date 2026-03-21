import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { authApi } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { AlertBanner, SurfaceCard } from "../components/ui/primitives";
import { normalizeRedirectPath } from "../utils/navigation";

export function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || "";
  const initialDevVerificationCode =
    location.state?.devVerificationCode || null;
  const redirectTo = normalizeRedirectPath(location.state?.redirectTo);

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [devVerificationCode, setDevVerificationCode] = useState<string | null>(
    initialDevVerificationCode,
  );

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { setAuth } = useAuthStore();

  useEffect(() => {
    if (!email) {
      navigate("/register");
    }
  }, [email, navigate]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newCode.every((digit) => digit !== "")) {
      handleVerify(newCode.join(""));
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
      const newCode = pastedData.split("");
      setCode(newCode);
      inputRefs.current[5]?.focus();
      handleVerify(pastedData);
    }
  };

  const handleVerify = async (verificationCode: string) => {
    if (verificationCode.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      const response = await authApi.verifyEmail({
        email,
        code: verificationCode,
      });

      setAuth(response.user, response.access_token);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await authApi.resendVerification(email);
      setSuccess("Verification code sent!");
      setDevVerificationCode(response.verificationCode || null);
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
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
            <div className="eyebrow-label">Email verification</div>
            <h1 className="text-3xl font-display font-semibold text-white">
              Verify your email
            </h1>
            <p className="text-sm leading-6 text-slate-400">
              We sent a 6-digit code to{" "}
              <span className="text-accent">{email}</span>
            </p>
          </div>

          {error && (
            <AlertBanner
              dismissible
              onDismiss={() => setError(null)}
              title="Verification failed"
            >
              {error}
            </AlertBanner>
          )}

          {success && (
            <AlertBanner
              tone="success"
              dismissible
              onDismiss={() => setSuccess(null)}
              title="Code sent"
            >
              {success}
            </AlertBanner>
          )}

          <AlertBanner tone="info" title="Local development note">
            If SMTP is not configured, the backend logs the verification code
            instead of sending an email.
          </AlertBanner>

          {devVerificationCode && (
            <AlertBanner tone="success" title="Development verification code">
              Use{" "}
              <span className="font-semibold text-white">
                {devVerificationCode}
              </span>{" "}
              to continue locally.
            </AlertBanner>
          )}

          <div className="flex justify-center gap-3 mb-8" onPaste={handlePaste}>
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
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={loading}
                className="h-14 w-12 rounded-2xl border border-white/8 bg-surface-400 text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50 transition-all"
              />
            ))}
          </div>

          {loading && (
            <div className="flex justify-center mb-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poker-gold"></div>
            </div>
          )}

          <div className="text-center">
            <p className="mb-4 text-slate-400">Didn&apos;t receive the code?</p>
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || loading}
              className="inline-flex items-center gap-2 font-medium text-accent underline decoration-accent/60 underline-offset-4 transition hover:text-accent-light hover:decoration-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend Code"}
            </button>
          </div>

          <div className="mt-8 border-t border-white/8 pt-6 text-center">
            <div className="space-y-2 text-sm text-slate-400">
              <p>Wrong email?</p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 font-medium text-accent underline decoration-accent/60 underline-offset-4 transition hover:text-accent-light hover:decoration-accent-light"
              >
                Go back to registration
              </Link>
            </div>
          </div>
        </SurfaceCard>
      </motion.div>
    </div>
  );
}
