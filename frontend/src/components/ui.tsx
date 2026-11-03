// src/components/ui.tsx
import type { ReactNode } from "react";
import { isActiveStatus, statusLabel } from "./status";

export const Spinner = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg
    className={`animate-spin ${className}`}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle
      cx="12"
      cy="12"
      r="9.5"
      stroke="currentColor"
      strokeOpacity="0.2"
      strokeWidth="3"
    />
    <path
      d="M21.5 12A9.5 9.5 0 0 0 12 2.5"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

export const PageLoader = ({ label }: { label: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted">
    <Spinner className="h-8 w-8 text-brand-600" />
    <p className="text-sm">{label}</p>
  </div>
);

export const StateMessage = ({
  icon,
  tone = "neutral",
  title,
  children,
  action,
}: {
  icon: ReactNode;
  tone?: "neutral" | "error" | "brand";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) => {
  const toneClasses = {
    neutral: "bg-paper text-muted",
    error: "bg-accent-50 text-accent-600",
    brand: "bg-brand-50 text-brand-700",
  }[tone];

  return (
    <div className="container-page flex min-h-[60vh] items-center justify-center py-12">
      <div className="card w-full max-w-md animate-fade-up p-8 text-center sm:p-10">
        <div
          className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${toneClasses}`}
        >
          {icon}
        </div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        {children && <div className="mt-2 text-muted">{children}</div>}
        {action && <div className="mt-7">{action}</div>}
      </div>
    </div>
  );
};

export const StatusBadge = ({ status }: { status: string }) => {
  const active = isActiveStatus(status);
  const classes = active
    ? "bg-brand-50 text-brand-700 ring-brand-200"
    : status === "COMPLETED"
      ? "bg-brand-700 text-white ring-brand-700"
      : status === "FAILED"
        ? "bg-accent-50 text-accent-600 ring-accent-100"
        : "bg-paper text-muted ring-line";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes}`}
    >
      {active && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
        </span>
      )}
      {statusLabel(status)}
    </span>
  );
};

export const ProgressBar = ({
  value,
  className = "h-2",
}: {
  value: number;
  className?: string;
}) => (
  <div
    className={`w-full overflow-hidden rounded-full bg-ink/[0.06] ${className}`}
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div
      className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-500 transition-all duration-700 ease-out"
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </div>
);

// Cover palettes: [background, ink, accent]
const COVER_PALETTES: [string, string, string][] = [
  ["#14594a", "#faf8f4", "#f3b89b"],
  ["#d9572b", "#fff7f0", "#ffd9b8"],
  ["#1f3a5f", "#f4f1ea", "#9cc3e6"],
  ["#e9dfcc", "#2b2620", "#d9572b"],
  ["#7a3b2e", "#fbf1e6", "#e8b38a"],
  ["#2e4b3c", "#f1efe4", "#c9d8a6"],
];

// FNV-1a: spreads similar titles ("...: A Life") across palettes
const hashString = (value: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * Typographic book cover derived from the title, so every book in the
 * library has its own recognisable look
 */
export const BookCover = ({
  title,
  author,
  className = "",
  size = "md",
  palette,
}: {
  title: string;
  author?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  /** Fixed palette index; defaults to one derived from the title */
  palette?: number;
}) => {
  const [bg, ink, accent] =
    COVER_PALETTES[(palette ?? hashString(title)) % COVER_PALETTES.length];
  const titleSize = {
    xs: "text-[9px]",
    sm: "text-sm",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-r-md rounded-l-sm p-4 shadow-lift ${className}`}
      style={{ backgroundColor: bg, color: ink }}
    >
      {/* Spine shading */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-2.5 bg-gradient-to-r from-black/25 to-transparent" />
      <div
        className="pointer-events-none absolute -right-10 -bottom-10 h-36 w-36 rounded-full opacity-25"
        style={{ backgroundColor: accent }}
      />
      <div
        className="h-px w-8"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
      <p
        className={`relative font-display leading-tight font-semibold break-words ${titleSize} line-clamp-4`}
      >
        {title}
      </p>
      {author ? (
        <p className="relative text-[10px] font-semibold tracking-[0.18em] uppercase opacity-80">
          {author}
        </p>
      ) : (
        <span />
      )}
    </div>
  );
};
