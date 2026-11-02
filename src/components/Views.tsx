import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Cpu,
  CreditCard,
  Database,
  ExternalLink,
  Globe2,
  Inbox,
  Lock,
  Mail,
  Radar,
  Server,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { SystemStatus, Task } from "../types.ts";
import {
  EmptyState,
  StatusBadge,
  formatTimestamp,
  shortId,
} from "./ui.tsx";

export function ApprovalsView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const pending = tasks.filter((task) => task.status === "AWAITING_APPROVAL");
  const decided = tasks.filter(
    (task) =>
      task.type === "OUTREACH_DRAFT" &&
      (task.approval?.status === "APPROVED" ||
        task.approval?.status === "REJECTED"),
  );

  return (
    <div className="view-stack">
      <section className="page-intro">
        <p className="eyebrow">Human control plane</p>
        <h1>Approvals</h1>
        <p>
          AGENT HQ can prepare local outreach drafts, but it has no send,
          publish, or payment bridge. Approval below records a human decision —
          it does not transmit anything.
        </p>
        <div className="intro-flags">
          <span>
            <ShieldCheck size={14} /> Approval required
          </span>
          <span>
            <ShieldX size={14} /> Send capability blocked
          </span>
          <span>
            <Lock size={14} /> No credentials configured
          </span>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Queue</p>
            <h2>Pending operator decisions</h2>
          </div>
          <span className="queue-total">{pending.length}</span>
        </header>
        {pending.length === 0 ? (
          <EmptyState icon={<Inbox size={26} />} title="No pending approvals">
            Open a completed research task and choose “Draft outreach” to create a
            local draft. Drafts arrive here and never leave the system without a
            human decision.
          </EmptyState>
        ) : (
          <div className="approval-list">
            {pending.map((task) => {
              const draft =
                task.result && "draft" in task.result ? task.result.draft : null;
              return (
                <button
                  type="button"
                  key={task.id}
                  className="approval-card"
                  onClick={() => onSelect(task.id)}
                >
                  <span className="approval-icon">
                    <Mail size={18} aria-hidden="true" />
                  </span>
                  <span className="approval-copy">
                    <span className="approval-top">
                      <strong>{task.title}</strong>
                      <StatusBadge status={task.status} />
                    </span>
                    <span className="approval-subject">
                      {draft?.subject ?? "Draft record"}
                    </span>
                    <span className="approval-meta">
                      {shortId(task.id)} · requested{" "}
                      {formatTimestamp(task.approval?.requestedAt)} · not sent
                    </span>
                  </span>
                  <span className="approval-open">
                    Review <ArrowRight size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Audit history</p>
            <h2>Decided drafts</h2>
          </div>
        </header>
        {decided.length === 0 ? (
          <p className="muted-copy">No operator decisions recorded yet.</p>
        ) : (
          <div className="decision-list">
            {decided.map((task) => (
              <button
                type="button"
                key={task.id}
                className="decision-row"
                onClick={() => onSelect(task.id)}
              >
                {task.approval?.status === "APPROVED" ? (
                  <CheckCircle2 size={15} className="text-ok" />
                ) : (
                  <CircleSlash size={15} className="text-bad" />
                )}
                <span>{task.title}</span>
                <span>{task.approval?.status}</span>
                <span>{formatTimestamp(task.approval?.decidedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const CAPABILITY_ICONS: Record<string, typeof Radar> = {
  "live-research": Radar,
  "website-audit": Globe2,
  "outreach-draft": Mail,
  "email-send": Mail,
  "website-publish": Server,
  payments: CreditCard,
};

export function SystemView({ system }: { system: SystemStatus | null }) {
  if (!system) {
    return (
      <section className="panel">
        <EmptyState icon={<Server size={26} />} title="Connecting to HQ server">
          System capability data could not be loaded yet.
        </EmptyState>
      </section>
    );
  }

  return (
    <div className="view-stack">
      <section className="page-intro">
        <p className="eyebrow">Operational truth</p>
        <h1>System</h1>
        <p>
          This page reports what the server can actually do. Paid dependencies
          are absent. External actions are blocked, not merely discouraged.
        </p>
        <div className="intro-flags">
          <span>
            <Database size={14} /> Disk-backed task store
          </span>
          <span>
            <Cpu size={14} /> {system.researchProvider}
          </span>
          <span>
            <Server size={14} /> v{system.version}
          </span>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Capability matrix</p>
            <h2>Execution bridges</h2>
          </div>
        </header>
        <div className="capability-grid">
          {system.capabilities.map((capability) => {
            const Icon = CAPABILITY_ICONS[capability.id] ?? Cpu;
            return (
              <div
                className={`capability capability-${capability.status.toLowerCase()}`}
                key={capability.id}
              >
                <span className="capability-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <div>
                  <span className="capability-status">{capability.status}</span>
                  <strong>{capability.label}</strong>
                  <p>{capability.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="system-columns">
        <section className="panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Verification protocol</p>
              <h2>Completion contract</h2>
            </div>
          </header>
          <ol className="protocol">
            <li>
              <span>01</span>
              <div>
                <strong>Accept</strong>
                <p>Validate input and persist a QUEUED task before execution.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Execute</strong>
                <p>
                  Fetch live public sources. Progress and errors stream to the
                  interface.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Verify</strong>
                <p>
                  Write the result, read it back from disk, and compare required
                  fields.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Deliver</strong>
                <p>
                  Broadcast to connected clients and expose the durable API
                  record. Only then: COMPLETED.
                </p>
              </div>
            </li>
            <li>
              <span>05</span>
              <div>
                <strong>Gate</strong>
                <p>
                  Outreach stays local and AWAITING APPROVAL. No send bridge
                  exists.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <p className="eyebrow">Environment</p>
              <h2>Runtime facts</h2>
            </div>
          </header>
          <dl className="runtime-list">
            <div>
              <dt>Mode</dt>
              <dd>{system.mode}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{formatTimestamp(system.startedAt)}</dd>
            </div>
            <div>
              <dt>Research provider</dt>
              <dd>{system.researchProvider}</dd>
            </div>
            <div>
              <dt>Connected streams</dt>
              <dd>{system.connectedClients}</dd>
            </div>
            <div>
              <dt>Approval policy</dt>
              <dd>{system.approvalPolicy}</dd>
            </div>
            <div>
              <dt>Baseline checkpoint</dt>
              <dd>
                870d509 not present in repository; pre-change HEAD preserved as
                tag <code>pre-phase2-baseline</code>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Known blockers</p>
            <h2>What Phase 2 does not do</h2>
          </div>
        </header>
        <div className="blocker-list">
          <div>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>Email delivery</strong> — no provider, mailbox, or
              credentials. Drafts cannot be sent automatically.
            </span>
          </div>
          <div>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>Website publishing</strong> — no hosting target or deploy
              token. FORGE has no execution bridge.
            </span>
          </div>
          <div>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>Revenue and payments</strong> — no billing integration and
              no spend authority.
            </span>
          </div>
          <div>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>Model-assisted synthesis</strong> — no model provider key
              configured. Research is deterministic and evidence-first.
            </span>
          </div>
          <div>
            <AlertTriangle size={15} aria-hidden="true" />
            <span>
              <strong>Business registry checks</strong> — identity rests on
              OpenStreetMap and the business's own website, not a government
              registry.
            </span>
          </div>
        </div>
      </section>

      <section className="panel links-panel">
        <header className="panel-head">
          <div>
            <p className="eyebrow">Read-only endpoints</p>
            <h2>Inspect the source of truth</h2>
          </div>
        </header>
        <div className="endpoint-links">
          <a href="/api/system" target="_blank" rel="noreferrer">
            /api/system <ExternalLink size={12} />
          </a>
          <a href="/api/tasks" target="_blank" rel="noreferrer">
            /api/tasks <ExternalLink size={12} />
          </a>
          <a href="/api/health" target="_blank" rel="noreferrer">
            /api/health <ExternalLink size={12} />
          </a>
        </div>
      </section>
    </div>
  );
}
