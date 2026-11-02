import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileSearch,
  Fingerprint,
  Globe2,
  Inbox,
  Lock,
  MailWarning,
  MapPin,
  RefreshCw,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import type {
  OutreachDraftResult,
  Prospect,
  ResearchResult,
  SourceReference,
  Task,
} from "../types.ts";
import {
  CheckLine,
  EmptyState,
  StatusBadge,
  VerificationBadge,
  formatDate,
  formatTimestamp,
  shortId,
} from "./ui.tsx";

export function TaskDetail({
  task,
  onRetry,
  onOutreach,
  onDecision,
  busy,
  connectedClients,
}: {
  task: Task | null;
  onRetry: (id: string) => Promise<void>;
  onOutreach: (parentTaskId: string, prospectId: string) => Promise<void>;
  onDecision: (
    id: string,
    decision: "APPROVE" | "REJECT",
    note: string,
  ) => Promise<void>;
  busy: boolean;
  connectedClients: number;
}) {
  if (!task) {
    return (
      <section className="panel detail-panel">
        <EmptyState icon={<Inbox size={26} />} title="No task selected">
          Assign a research run from Mission Control. The execution record,
          evidence, and delivery proof will appear here as they happen.
        </EmptyState>
      </section>
    );
  }

  const research =
    task.result && "prospects" in task.result
      ? (task.result as ResearchResult)
      : null;
  const outreach =
    task.result && "draft" in task.result
      ? (task.result as OutreachDraftResult)
      : null;
  const allSources: SourceReference[] = research
    ? [...research.sources, ...research.prospects.flatMap((item) => item.sources)]
    : [];
  const uniqueSources = dedupeSources(allSources);

  return (
    <section className="panel detail-panel" aria-live="polite">
      <header className="detail-head">
        <div>
          <p className="eyebrow">
            {task.type === "PROSPECT_RESEARCH"
              ? "NOVA / FIELD RESEARCH"
              : "ECHO / APPROVAL GATE"}
          </p>
          <h2>{task.title}</h2>
          <p className="detail-brief">{task.brief}</p>
        </div>
        <StatusBadge status={task.status} />
      </header>

      <div className="detail-meta">
        <span>
          <Fingerprint size={13} aria-hidden="true" />
          {task.id}
        </span>
        <span>
          <Clock3 size={13} aria-hidden="true" />
          Created {formatTimestamp(task.createdAt)}
        </span>
        {task.completedAt ? (
          <span>
            <CheckCircle2 size={13} aria-hidden="true" />
            Finished {formatTimestamp(task.completedAt)}
          </span>
        ) : null}
        <span className="mode-tag">
          {task.execution.mode} · {task.execution.provider}
        </span>
      </div>

      <div className="progress-card">
        <div className="progress-copy">
          <div>
            <span className="eyebrow">Current stage</span>
            <strong>{task.progress.stage}</strong>
          </div>
          <span>{task.progress.percent}%</span>
        </div>
        <div
          className={`progress-track progress-${task.status.toLowerCase()}`}
          role="progressbar"
          aria-valuenow={task.progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${task.progress.percent}%` }} />
        </div>
        <p className="progress-message">{task.progress.message}</p>
        <p className="progress-attempt">
          Execution attempts: {task.execution.attemptedPasses}
          {task.startedAt ? ` · started ${formatTimestamp(task.startedAt)}` : ""}
        </p>
      </div>

      {task.error ? (
        <div className="error-card">
          <div className="error-title">
            <XCircle size={17} aria-hidden="true" />
            <strong>{task.error.code}</strong>
            <span>{formatTimestamp(task.error.at)}</span>
          </div>
          <p>{task.error.message}</p>
          {task.error.detail ? (
            <pre className="error-detail">{task.error.detail}</pre>
          ) : null}
          <div className="error-actions">
            <span>
              {task.error.retryable
                ? "Marked retryable. No partial result was retained."
                : "Non-retryable. Review the record before creating a new task."}
            </span>
            {task.error.retryable ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => void onRetry(task.id)}
                disabled={busy}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Retry execution
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="delivery-card">
        <div className="delivery-head">
          <div>
            <p className="eyebrow">Result delivery</p>
            <strong>
              {task.delivery.readbackVerified
                ? "PERSISTED & READ BACK"
                : task.status === "COMPLETED"
                  ? "COMPLETED — VERIFY DELIVERY"
                  : "AWAITING VERIFIED DELIVERY"}
            </strong>
          </div>
          <span
            className={`delivery-seal ${
              task.delivery.readbackVerified ? "seal-ok" : "seal-idle"
            }`}
          >
            <ShieldCheck size={15} aria-hidden="true" />
            {task.delivery.readbackVerified ? "VERIFIED" : "UNVERIFIED"}
          </span>
        </div>
        <div className="check-grid">
          <CheckLine
            ok={task.delivery.persisted}
            label="Durable write"
            detail={
              task.delivery.persistedAt
                ? formatTimestamp(task.delivery.persistedAt)
                : "Not written yet"
            }
          />
          <CheckLine
            ok={task.delivery.readbackVerified}
            label="Disk read-back"
            detail={
              task.delivery.verifiedAt
                ? formatTimestamp(task.delivery.verifiedAt)
                : "Not verified"
            }
          />
          <CheckLine
            ok={task.delivery.readbackVerified}
            label="Interface broadcast"
            detail={`${task.delivery.broadcastClients} SSE client(s) at delivery; ${
              connectedClients
            } connected now`}
          />
          <CheckLine
            ok={task.delivery.readbackVerified}
            label="API retrieval"
            detail={task.delivery.apiPath}
          />
        </div>
      </div>

      {research ? (
        <ResearchReport
          task={task}
          research={research}
          sources={uniqueSources}
          onOutreach={onOutreach}
          busy={busy}
        />
      ) : null}

      {outreach ? (
        <OutreachView
          task={task}
          outreach={outreach}
          onDecision={onDecision}
          busy={busy}
        />
      ) : null}

      <section className="timeline">
        <div className="timeline-head">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h3>Execution timeline</h3>
          </div>
          <span>{task.events.length} events</span>
        </div>
        <ol>
          {task.events.map((event) => (
            <li key={event.id} className={`event-${event.kind.toLowerCase()}`}>
              <span className="event-dot" />
              <div>
                <span className="event-meta">
                  {formatTimestamp(event.at)} · {event.kind}
                  {event.status ? ` → ${event.status}` : ""}
                </span>
                <p>{event.message}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}

function ResearchReport({
  task,
  research,
  sources,
  onOutreach,
  busy,
}: {
  task: Task;
  research: ResearchResult;
  sources: SourceReference[];
  onOutreach: (parentTaskId: string, prospectId: string) => Promise<void>;
  busy: boolean;
}) {
  return (
    <section className="report">
      <header className="report-head">
        <div className="report-title">
          <span className="report-icon">
            <FileSearch size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">Evidence-backed field report</p>
            <h3>
              {research.assignment.deliveredCount} verified prospect
              {research.assignment.deliveredCount === 1 ? "" : "s"}
            </h3>
          </div>
        </div>
        <div className="report-stamp">
          <span>Delivered</span>
          <strong>{formatTimestamp(task.completedAt ?? research.executedAt)}</strong>
        </div>
      </header>

      <div className="report-summary">
        <div>
          <span>Market</span>
          <strong>{research.assignment.city}</strong>
        </div>
        <div>
          <span>Category</span>
          <strong>{research.assignment.category}</strong>
        </div>
        <div>
          <span>Candidates examined</span>
          <strong>{research.candidatesExamined}</strong>
        </div>
        <div>
          <span>Websites audited</span>
          <strong>{research.websitesAudited}</strong>
        </div>
        <div>
          <span>Sources captured</span>
          <strong>{sources.length}</strong>
        </div>
      </div>

      <div className="prospect-stack">
        {research.prospects.map((prospect) => (
          <ProspectCard
            key={prospect.id}
            prospect={prospect}
            sources={sources}
            onOutreach={onOutreach}
            parentTaskId={task.id}
            busy={busy}
            canDraft={task.status === "COMPLETED"}
          />
        ))}
      </div>

      <details className="method-card">
        <summary>
          Methodology & limitations
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="method-grid">
          <div>
            <h4>Method</h4>
            <ol>
              {research.methodology.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <h4>Limitations</h4>
            <ul>
              {research.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

function ProspectCard({
  prospect,
  sources,
  onOutreach,
  parentTaskId,
  busy,
  canDraft,
}: {
  prospect: Prospect;
  sources: SourceReference[];
  onOutreach: (parentTaskId: string, prospectId: string) => Promise<void>;
  parentTaskId: string;
  busy: boolean;
  canDraft: boolean;
}) {
  const [openSources, setOpenSources] = useState(false);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const website = prospect.website;

  return (
    <article className="prospect">
      <header className="prospect-head">
        <span className="prospect-rank">
          {String(prospect.rank).padStart(2, "0")}
        </span>
        <div className="prospect-name">
          <h4>{prospect.businessName}</h4>
          <p>
            <MapPin size={13} aria-hidden="true" />
            {prospect.location.address}, {prospect.location.city}
            {prospect.location.country ? `, ${prospect.location.country}` : ""}
          </p>
        </div>
        <div className={`opportunity opportunity-${prospect.opportunity.level.toLowerCase()}`}>
          <span className="opportunity-score">{prospect.opportunity.score}</span>
          <span>
            <strong>{prospect.opportunity.level}</strong>
            opportunity / 100
          </span>
        </div>
      </header>

      <div className="opportunity-track">
        <span
          className={`fill-${prospect.opportunity.level.toLowerCase()}`}
          style={{ width: `${prospect.opportunity.score}%` }}
        />
      </div>

      <div className="website-strip">
        <span className="website-icon">
          <Globe2 size={16} aria-hidden="true" />
        </span>
        <div>
          <span>Official website</span>
          {website.finalUrl || website.url ? (
            <a
              href={website.finalUrl ?? website.url ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
            >
              {website.domain ?? website.url}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          ) : (
            <strong>No official site verified</strong>
          )}
        </div>
        <VerificationBadge verification={website.verification} />
        {website.audit ? (
          <span
            className={`identity-badge identity-${website.audit.titleMatch.toLowerCase()}`}
            title="Whether the business name appeared in the page title, main heading, or body text"
          >
            {website.audit.titleMatch === "STRONG"
              ? "NAME CONFIRMED"
              : website.audit.titleMatch === "PARTIAL"
                ? "NAME IN PAGE"
                : "IDENTITY UNCONFIRMED"}
          </span>
        ) : null}
        <span className="website-http">
          {website.httpStatus ? `HTTP ${website.httpStatus}` : "NO RESPONSE"}
          {website.responseMs !== null ? ` · ${website.responseMs} ms` : ""}
        </span>
      </div>

      <p className="opportunity-summary">{prospect.opportunity.summary}</p>

      <div className="prospect-columns">
        <div className="prospect-block">
          <h5>
            <ShieldCheck size={13} aria-hidden="true" />
            Verified facts
          </h5>
          <ul className="fact-list">
            {prospect.facts.map((fact) => (
              <li key={fact.statement}>
                <span>{fact.statement}</span>
                <span className="ref-row">
                  {fact.sourceRefs.map((ref) => (
                    <RefChip key={ref} id={ref} lookup={sourceById} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="prospect-block">
          <h5>
            <AlertTriangle size={13} aria-hidden="true" />
            Assumptions & limits
          </h5>
          <ul className="assumption-list">
            {prospect.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="signals">
        <h5>Observed opportunity signals</h5>
        <div className="signal-grid">
          {prospect.opportunity.signals.map((signal) => (
            <div className="signal" key={signal.code}>
              <div className="signal-top">
                <strong>{signal.label}</strong>
                <span>+{signal.impact}</span>
              </div>
              <p>{signal.evidence}</p>
              <div className="ref-row">
                {signal.sourceRefs.map((ref) => (
                  <RefChip key={ref} id={ref} lookup={sourceById} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="prospect-foot">
        <span>
          <Clock3 size={12} aria-hidden="true" />
          Research captured {formatTimestamp(prospect.researchTimestamp)} · OSM{" "}
          {prospect.osm.type}/{prospect.osm.id}
        </span>
        <div className="prospect-actions">
          <button
            type="button"
            className="button ghost"
            onClick={() => setOpenSources((value) => !value)}
            aria-expanded={openSources}
          >
            <ClipboardList size={14} aria-hidden="true" />
            {openSources ? "Hide" : "View"} {prospect.sources.length} sources
          </button>
          {canDraft ? (
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => void onOutreach(parentTaskId, prospect.id)}
            >
              <MailWarning size={14} aria-hidden="true" />
              Draft outreach
            </button>
          ) : null}
        </div>
      </div>

      {openSources ? (
        <div className="source-panel">
          {prospect.sources.map((source) => (
            <SourceItem key={source.id} source={source} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function RefChip({
  id,
  lookup,
}: {
  id: string;
  lookup: Map<string, SourceReference>;
}) {
  const source = lookup.get(id);
  const label = source
    ? source.kind === "OPENSTREETMAP"
      ? "OSM"
      : source.kind === "WEBSITE"
        ? "WEB"
        : source.kind === "NOMINATIM"
          ? "GEO"
          : source.kind
    : id.split("-").at(-1);
  return (
    <span className="ref-chip" title={source?.title ?? id}>
      {label}
    </span>
  );
}

function SourceItem({ source }: { source: SourceReference }) {
  return (
    <div className="source-item">
      <div className="source-top">
        <span className="source-kind">{source.kind}</span>
        <a href={source.url} target="_blank" rel="noreferrer noopener">
          {source.title}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>
      <p>{source.excerpt}</p>
      <div className="source-meta">
        <span>{source.publisher}</span>
        <span>Retrieved {formatTimestamp(source.retrievedAt)}</span>
        {source.contentHash ? (
          <span className="hash">sha256:{source.contentHash.slice(0, 16)}…</span>
        ) : null}
      </div>
    </div>
  );
}

function OutreachView({
  task,
  outreach,
  onDecision,
  busy,
}: {
  task: Task;
  outreach: OutreachDraftResult;
  onDecision: (
    id: string,
    decision: "APPROVE" | "REJECT",
    note: string,
  ) => Promise<void>;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const pending = task.status === "AWAITING_APPROVAL";

  return (
    <section className="outreach">
      <header className="outreach-head">
        <MailWarning size={18} aria-hidden="true" />
        <div>
          <p className="eyebrow">Approval gate</p>
          <h3>Local outreach draft — not sent</h3>
        </div>
        <span className="not-sent">SENT: FALSE</span>
      </header>

      <div className="draft-meta">
        <span>Channel: {outreach.draft.channel}</span>
        <span>Recipient address: not verified / not collected</span>
        <span>Prospect: {outreach.businessName}</span>
      </div>

      <div className="draft-box">
        <div>
          <span>Subject</span>
          <strong>{outreach.draft.subject}</strong>
        </div>
        <pre>{outreach.draft.body}</pre>
      </div>

      <div className="approval-note">
        <Lock size={14} aria-hidden="true" />
        <p>{outreach.note}</p>
      </div>

      {pending ? (
        <div className="decision-box">
          <label>
            <span>Operator note (optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="Why is this draft approved or rejected?"
              disabled={busy}
            />
          </label>
          <div className="decision-actions">
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => void onDecision(task.id, "REJECT", note)}
            >
              <ThumbsDown size={14} aria-hidden="true" />
              Reject draft
            </button>
            <button
              type="button"
              className="button approve"
              disabled={busy}
              onClick={() => void onDecision(task.id, "APPROVE", note)}
            >
              <ThumbsUp size={14} aria-hidden="true" />
              Approve for manual use
            </button>
          </div>
          <p className="decision-caveat">
            Approval records a human decision. It does not send email, publish a
            site, or spend money.
          </p>
        </div>
      ) : (
        <div
          className={`decision-result ${
            outreach.approval.status === "APPROVED" ? "result-ok" : "result-reject"
          }`}
        >
          {outreach.approval.status === "APPROVED" ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <XCircle size={16} aria-hidden="true" />
          )}
          <div>
            <strong>{outreach.approval.status}</strong>
            <p>
              {outreach.approval.status === "APPROVED"
                ? "Approved for manual use. AGENT HQ did not send anything."
                : "Rejected by the operator. Nothing was sent."}
              {outreach.approval.note ? ` Note: ${outreach.approval.note}` : ""}
            </p>
            <span>{formatTimestamp(outreach.approval.decidedAt)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function dedupeSources(sources: SourceReference[]): SourceReference[] {
  const seen = new Map<string, SourceReference>();
  for (const source of sources) {
    if (!seen.has(source.id)) seen.set(source.id, source);
  }
  return [...seen.values()];
}

export function NoTasksBrief() {
  return (
    <section className="panel detail-panel briefing">
      <div className="briefing-art" aria-hidden="true">
        <span />
        <Bot size={34} />
      </div>
      <p className="eyebrow">Standing assignment</p>
      <h2>Three real prospects. Three evidence trails.</h2>
      <p className="briefing-lead">
        NOVA will search public map data for businesses with listed websites,
        audit each homepage, and return only prospects whose pages actually
        loaded. Every fact carries a source. Assumptions are separated.
      </p>
      <div className="briefing-steps">
        <div>
          <span>01</span>
          <strong>Discover</strong>
          <p>OpenStreetMap directory + Nominatim city resolution.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Verify</strong>
          <p>Direct HTTP fetch of each official site, with evidence hashes.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Deliver</strong>
          <p>Persist, read back from disk, then mark COMPLETED.</p>
        </div>
      </div>
      <div className="briefing-guard">
        <Lock size={14} aria-hidden="true" />
        <span>
          No model API key required. No outreach, publishing, or spend is
          connected. Failed runs stay visible and retryable.
        </span>
      </div>
    </section>
  );
}

export function TaskCompactSummary({ task }: { task: Task }) {
  const result = task.result;
  const count =
    result && "prospects" in result ? result.prospects.length : null;
  return (
    <span className="compact-summary">
      {shortId(task.id)} · {formatDate(task.createdAt)} ·{" "}
      {count !== null ? `${count} prospects` : task.status.toLowerCase()}
    </span>
  );
}
