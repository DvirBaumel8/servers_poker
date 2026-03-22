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
    <div className="space-y-6">
      {backHref && (
        <Link to={backHref} className="btn-ghost -ml-2 w-fit">
          <ArrowLeftIcon />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
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
          <div className="flex flex-wrap items-center gap-4 py-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "text";
type ButtonSize = "sm" | "md" | "lg";

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  asLink,
  ...props
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  asLink?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "",
    lg: "px-6 py-3 text-base",
  };

  const classes = clsx(
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    variant === "text" && "btn-text",
    size !== "md" && sizeClasses[size],
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
  onRetry,
  helpLink,
  helpText = "Learn more",
  className,
}: {
  title?: string;
  children: ReactNode;
  tone?: "danger" | "warning" | "success" | "info";
  dismissible?: boolean;
  onDismiss?: () => void;
  onRetry?: () => void;
  helpLink?: string;
  helpText?: string;
  className?: string;
}) {
  const toneStyles = {
    danger: "border-danger/35 bg-danger-muted text-red-200",
    warning: "border-warning/35 bg-warning-muted text-yellow-100",
    success: "border-success/35 bg-success-muted text-emerald-100",
    info: "border-info/35 bg-info-muted text-blue-100",
  };

  const iconColors = {
    danger: "text-red-400",
    warning: "text-yellow-400",
    success: "text-emerald-400",
    info: "text-blue-400",
  };

  return (
    <div
      role="alert"
      className={clsx(
        "rounded-2xl border px-4 py-4 text-sm",
        toneStyles[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={clsx("mt-0.5 shrink-0", iconColors[tone])}>
            {tone === "danger" && (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {tone === "warning" && (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {tone === "success" && (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            {tone === "info" && (
              <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
          <div className="space-y-1">
            {title && <div className="font-semibold text-white">{title}</div>}
            <div className="leading-6">{children}</div>
          </div>
        </div>
        {dismissible && onDismiss && (
          <button
            onClick={onDismiss}
            className="btn-ghost min-h-[44px] min-w-[44px] flex items-center justify-center text-sm shrink-0"
            aria-label="Dismiss alert"
          >
            Dismiss
          </button>
        )}
      </div>
      {(onRetry || helpLink) && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white hover:text-accent transition-colors min-h-[44px]"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                  clipRule="evenodd"
                />
              </svg>
              Try again
            </button>
          )}
          {helpLink && (
            <a
              href={helpLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white transition-colors min-h-[44px]"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              {helpText}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  illustration,
  className,
}: {
  title: string;
  description: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  illustration?:
    | "table"
    | "tournament"
    | "bot"
    | "leaderboard"
    | "waiting"
    | "game"
    | "analytics";
  className?: string;
}) {
  const renderIllustration = () => {
    if (icon) return icon;

    switch (illustration) {
      case "table":
        return <EmptyTableIllustration />;
      case "tournament":
        return <EmptyTournamentIllustration />;
      case "bot":
        return <EmptyBotIllustration />;
      case "leaderboard":
        return <EmptyLeaderboardIllustration />;
      case "waiting":
        return <WaitingIllustration />;
      case "game":
        return <GameIllustration />;
      case "analytics":
        return <AnalyticsIllustration />;
      default:
        return <SparkIcon />;
    }
  };

  return (
    <SurfaceCard className={clsx("py-12 text-center", className)}>
      <div className="mx-auto flex max-w-md flex-col items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] text-accent">
          {renderIllustration()}
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="section-subtitle">{description}</p>
        </div>
        {action && <div className="pt-4 mt-2">{action}</div>}
      </div>
    </SurfaceCard>
  );
}

function EmptyTableIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <ellipse
        cx="20"
        cy="22"
        rx="14"
        ry="8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <path
        d="M6 22v4c0 4.418 6.268 8 14 8s14-3.582 14-8v-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="20" cy="18" r="3" fill="currentColor" opacity="0.3" />
      <path
        d="M20 8v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M17 11l3-3 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyTournamentIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <path
        d="M12 14H8a2 2 0 01-2-2v-2a2 2 0 012-2h4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M28 14h4a2 2 0 002-2v-2a2 2 0 00-2-2h-4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M14 32h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 26v6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M13 8h14v8a7 7 0 01-14 0V8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="20" cy="14" r="2" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

function EmptyBotIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <rect
        x="8"
        y="14"
        width="24"
        height="18"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <path
        d="M14 14v-2a6 6 0 1112 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="15" cy="22" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="25" cy="22" r="2" fill="currentColor" opacity="0.5" />
      <path
        d="M16 28h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M20 8v4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EmptyLeaderboardIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <rect
        x="6"
        y="22"
        width="8"
        height="12"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <rect
        x="16"
        y="14"
        width="8"
        height="20"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <rect
        x="26"
        y="18"
        width="8"
        height="16"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="20" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M20 5l1 2h2l-1.5 1.5.5 2-2-1-2 1 .5-2L17 7h2l1-2z"
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );
}

function WaitingIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <circle
        cx="20"
        cy="20"
        r="12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle
        cx="20"
        cy="20"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.5"
      />
      <path
        d="M20 14v6l4 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="1.5" fill="currentColor" />
    </svg>
  );
}

function GameIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <rect
        x="6"
        y="10"
        width="12"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <rect
        x="22"
        y="10"
        width="12"
        height="16"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <text
        x="12"
        y="21"
        fontSize="8"
        fill="currentColor"
        textAnchor="middle"
        opacity="0.6"
      >
        A
      </text>
      <text
        x="28"
        y="21"
        fontSize="8"
        fill="currentColor"
        textAnchor="middle"
        opacity="0.6"
      >
        K
      </text>
      <path
        d="M12 30h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
        strokeLinecap="round"
      />
      <circle cx="20" cy="34" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

function AnalyticsIllustration() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 40 40" fill="none">
      <path
        d="M6 34V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6 34h28"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 28l6-8 6 4 8-12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="3 2"
      />
      <circle cx="10" cy="28" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="16" cy="20" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="22" cy="24" r="2" fill="currentColor" opacity="0.5" />
      <circle cx="30" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
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
          className="absolute inset-y-1.5 right-1.5 inline-flex items-center justify-center rounded-xl px-3 min-w-[44px] min-h-[36px] text-slate-400 transition hover:bg-white/[0.04] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/20"
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
      role="tablist"
      className={clsx(
        "inline-flex flex-wrap gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5",
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={clsx(
            "min-h-[44px] cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
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
                  className="btn-ghost min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  Close
                </button>
              </div>
              <div className="px-6 py-5">{children}</div>
              {footer && (
                <div className="border-t border-white/8 px-6 py-5">
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
