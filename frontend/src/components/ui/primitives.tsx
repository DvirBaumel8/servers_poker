import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Fragment,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useState,
} from "react";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("page-shell", className)}>{children}</div>;
}

export function SurfaceCard({
  children,
  className,
  muted = false,
}: {
  children: ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={clsx(muted ? "surface-card-muted" : "surface-card", className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="space-y-5">
      {backHref && (
        <Link to={backHref} className="btn-ghost -ml-2 w-fit">
          <ArrowLeftIcon />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          {eyebrow && <div className="eyebrow-label">{eyebrow}</div>}
          <div className="space-y-2">
            <h1 className="section-title">{title}</h1>
            {description && (
              <p className="section-subtitle max-w-3xl">{description}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  className,
  variant = "primary",
  asLink,
  ...props
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  asLink?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = clsx(
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    className,
  );

  if (asLink) {
    return (
      <Link to={asLink} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button {...props} className={classes}>
      {children}
    </button>
  );
}

export function AlertBanner({
  title,
  children,
  tone = "danger",
  dismissible = false,
  onDismiss,
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: "danger" | "warning" | "success" | "info";
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}) {
  const toneStyles = {
    danger: "border-danger/35 bg-danger-muted text-red-200",
    warning: "border-warning/35 bg-warning-muted text-yellow-100",
    success: "border-success/35 bg-success-muted text-emerald-100",
    info: "border-info/35 bg-info-muted text-blue-100",
  };

  return (
    <div
      role="alert"
      className={clsx(
        "flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm",
        toneStyles[tone],
        className,
      )}
    >
      <div className="space-y-1">
        {title && <div className="font-semibold text-white">{title}</div>}
        <div className="leading-6">{children}</div>
      </div>
      {dismissible && onDismiss && (
        <button
          onClick={onDismiss}
          className="btn-ghost -mr-2 -mt-1 px-2 py-1 text-xs"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <SurfaceCard className={clsx("py-12 text-center", className)}>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-accent">
          {icon ?? <SparkIcon />}
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="section-subtitle">{description}</p>
        </div>
        {action}
      </div>
    </SurfaceCard>
  );
}

export function LoadingBlock({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex min-h-[40vh] items-center justify-center",
        className,
      )}
    >
      <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent/20 border-t-accent" />
        <div>
          <div className="text-sm font-medium text-white">{label}</div>
          <div className="text-xs text-slate-500">
            Preparing live data and interface
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <SurfaceCard muted className={clsx("space-y-2", className)}>
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div
        className={clsx(
          "text-3xl font-semibold",
          accent ? "gold-gradient-text" : "text-white",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-sm text-slate-400">{hint}</div>}
    </SurfaceCard>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  multiline = false,
  select = false,
  children,
  ...props
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  multiline?: boolean;
  select?: boolean;
  children?: ReactNode;
} & (
  | InputHTMLAttributes<HTMLInputElement>
  | TextareaHTMLAttributes<HTMLTextAreaElement>
  | SelectHTMLAttributes<HTMLSelectElement>
)) {
  return (
    <label className={clsx("block space-y-2", className)}>
      <span className="text-sm font-medium text-slate-200">{label}</span>
      {multiline ? (
        <textarea
          {...(props as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          className="input-field min-h-28 resize-y"
        />
      ) : select ? (
        <select
          {...(props as SelectHTMLAttributes<HTMLSelectElement>)}
          className="input-field"
        >
          {children}
        </select>
      ) : (
        <input
          {...(props as InputHTMLAttributes<HTMLInputElement>)}
          className="input-field"
        />
      )}
      {error ? (
        <span className="text-sm text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function PasswordField({
  label,
  hint,
  error,
  className,
  ...props
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const accessibleLabel = label || "password";

  return (
    <label className={clsx("block space-y-2", className)}>
      {label && (
        <span className="text-sm font-medium text-slate-200">{label}</span>
      )}
      <div className="relative">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className="input-field pr-14"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={
            visible ? `Hide ${accessibleLabel}` : `Show ${accessibleLabel}`
          }
          className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl px-3 text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/20"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {error ? (
        <span className="text-sm text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "inline-flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={clsx(
            "rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
            value === item.value
              ? "bg-accent text-surface-400 shadow-glow-sm"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-white",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function StatusPill({
  label,
  tone,
  pulse = false,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  pulse?: boolean;
}) {
  const styles = {
    success: "border-success/30 bg-success-muted text-emerald-300",
    warning: "border-warning/30 bg-warning-muted text-yellow-200",
    danger: "border-danger/30 bg-danger-muted text-red-200",
    info: "border-info/30 bg-info-muted text-blue-200",
    neutral: "border-white/10 bg-white/[0.04] text-slate-300",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em]",
        styles[tone],
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          pulse && "animate-pulse",
          tone === "success" && "bg-success",
          tone === "warning" && "bg-warning",
          tone === "danger" && "bg-danger",
          tone === "info" && "bg-info",
          tone === "neutral" && "bg-slate-400",
        )}
      />
      {label}
    </span>
  );
}

export function AppModal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <Fragment>
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            className="fixed inset-x-4 top-1/2 z-[91] mx-auto w-full max-w-2xl -translate-y-1/2"
          >
            <SurfaceCard className="max-h-[85vh] overflow-auto p-0">
              <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-white">{title}</h2>
                  {description && (
                    <p className="text-sm text-slate-400">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="btn-ghost -mr-2 -mt-1 px-2 py-1"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-5">{children}</div>
              {footer && (
                <div className="border-t border-white/8 px-6 py-4">
                  {footer}
                </div>
              )}
            </SurfaceCard>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmTone = "danger",
  onClose,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmTone?: "primary" | "danger";
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <AppModal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={confirmTone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-sm leading-6 text-slate-400">
        This action may affect active gameplay, registrations, or automation
        flows.
      </div>
    </AppModal>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M9.707 15.707a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414l5-5a1 1 0 1 1 1.414 1.414L6.414 9H17a1 1 0 1 1 0 2H6.414l3.293 3.293a1 1 0 0 1 0 1.414Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M1.8 10s3-5.2 8.2-5.2 8.2 5.2 8.2 5.2-3 5.2-8.2 5.2S1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M2 2l16 16" />
      <path d="M8.7 4.96A8.88 8.88 0 0 1 10 4.8c5.2 0 8.2 5.2 8.2 5.2a15.1 15.1 0 0 1-3.25 3.84" />
      <path d="M5.15 7.16A15.2 15.2 0 0 0 1.8 10s3 5.2 8.2 5.2a8.9 8.9 0 0 0 2.74-.42" />
      <path d="M8.4 8.4A2.27 2.27 0 0 0 7.8 10c0 1.22.98 2.2 2.2 2.2.58 0 1.1-.22 1.5-.6" />
    </svg>
  );
}
