import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { TaskStatus } from "../types.ts";

export const STATUS_META: Record<
  TaskStatus,
  { label: string; className: string; icon: ReactNode }
> = {
  QUEUED: {
    label: "QUEUED",
    className: "status-queued",
    icon: <Clock3 size={13} aria-hidden="true" />,
  },
  RUNNING: {
    label: "RUNNING",
    className: "status-running",
    icon: <Loader2 size={13} className="spin" aria-hidden="true" />,
  },
  COMPLETED: {
    label: "COMPLETED",
    className: "status-completed",
    icon: <CheckCircle2 size={13} aria-hidden="true" />,
  },
  FAILED: {
    label: "FAILED",
    className: "status-failed",
    icon: <XCircle size={13} aria-hidden="true" />,
  },
  AWAITING_APPROVAL: {
    label: "AWAITING APPROVAL",
    className: "status-approval",
    icon: <ShieldAlert size={13} aria-hidden="true" />,
  },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`status-badge ${meta.className}`}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 12) : id;
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = "",
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function SourceChip({
  id,
  label,
  title,
}: {
  id: string;
  label: string;
  title?: string;
}) {
  return (
    <span className="source-chip" title={title ?? id}>
      <span className="source-chip-id">{label}</span>
    </span>
  );
}

export function VerificationBadge({
  verification,
}: {
  verification:
    | "PAGE_VERIFIED"
    | "TAG_ONLY"
    | "UNREACHABLE"
    | "NOT_PROVIDED";
}) {
  const config = {
    PAGE_VERIFIED: { label: "PAGE VERIFIED", className: "verify-good" },
    TAG_ONLY: { label: "TAG ONLY", className: "verify-warn" },
    UNREACHABLE: { label: "UNREACHABLE", className: "verify-bad" },
    NOT_PROVIDED: { label: "NOT PROVIDED", className: "verify-bad" },
  }[verification];
  return <span className={`verify-badge ${config.className}`}>{config.label}</span>;
}

export function CheckLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className={`check-line ${ok ? "check-ok" : "check-no"}`}>
      <span className="check-mark">
        {ok ? <Check size={12} /> : <AlertTriangle size={12} />}
      </span>
      <span>
        <strong>{label}</strong>
        <em>{detail}</em>
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
