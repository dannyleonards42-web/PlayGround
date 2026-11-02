import {
  Activity,
  Compass,
  Cpu,
  Hammer,
  Radar,
  Send,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import type { SystemStatus, Task } from "../types.ts";
import { formatTimestamp } from "./ui.tsx";

const AGENTS = [
  {
    id: "NOVA",
    role: "Research & evidence",
    icon: Radar,
    status: "LIVE",
    detail: "Open-data HTTP bridge",
  },
  {
    id: "FORGE",
    role: "Website production",
    icon: Hammer,
    status: "STANDBY",
    detail: "No build executor connected",
  },
  {
    id: "ATLAS",
    role: "Strategy & analysis",
    icon: Compass,
    status: "STANDBY",
    detail: "No model provider configured",
  },
  {
    id: "ECHO",
    role: "Outreach",
    icon: Send,
    status: "GATED",
    detail: "Drafts only · send blocked",
  },
] as const;

export function AgentRail({
  tasks,
  system,
  connected,
}: {
  tasks: Task[];
  system: SystemStatus | null;
  connected: boolean;
}) {
  const running = tasks.find((task) => task.status === "RUNNING");
  const queued = tasks.filter((task) => task.status === "QUEUED").length;
  const completed = tasks.filter(
    (task) => task.status === "COMPLETED" && task.type === "PROSPECT_RESEARCH",
  );
  const delivered = completed.reduce((total, task) => {
    const result = task.result;
    return total + (result && "prospects" in result ? result.prospects.length : 0);
  }, 0);
  const lastCompleted = completed
    .map((task) => task.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  const novaStatus = running
    ? "EXECUTING"
    : queued > 0
      ? "TASK ASSIGNED"
      : "STANDBY";
  const novaDetail = running
    ? running.progress.message
    : queued > 0
      ? `${queued} task${queued === 1 ? "" : "s"} waiting in queue`
      : "Ready. No simulated activity.";

  return (
    <aside className="rail" aria-label="Agent roster and execution status">
      <section className={`nova-card ${running ? "nova-active" : ""}`}>
        <div className="nova-orbit" aria-hidden="true">
          <span className="orbit-ring" />
          <div className="nova-core">N</div>
        </div>
        <div className="nova-head">
          <div>
            <p className="eyebrow">Primary operator</p>
            <h2>NOVA</h2>
          </div>
          <span className={`agent-state ${running ? "state-live" : ""}`}>
            <span className="dot" />
            {novaStatus}
          </span>
        </div>
        <p className="nova-detail">{novaDetail}</p>
        <div className="nova-metrics">
          <div>
            <strong>{delivered}</strong>
            <span>prospects delivered</span>
          </div>
          <div>
            <strong>{completed.length}</strong>
            <span>completed runs</span>
          </div>
        </div>
        <div className="nova-last">
          <Activity size={13} aria-hidden="true" />
          <span>
            Last verified delivery:{" "}
            {lastCompleted ? formatTimestamp(lastCompleted) : "none yet"}
          </span>
        </div>
      </section>

      <section className="panel rail-panel">
        <header className="rail-head">
          <h2>Agent roster</h2>
          <span className="rail-count">04</span>
        </header>
        <div className="agent-list">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <div className="agent-row" key={agent.id}>
                <span className={`agent-icon agent-${agent.status.toLowerCase()}`}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div className="agent-copy">
                  <div>
                    <strong>{agent.id}</strong>
                    <span
                      className={`agent-tag tag-${agent.status.toLowerCase()}`}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <span>{agent.role}</span>
                  <em>{agent.detail}</em>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel rail-panel">
        <header className="rail-head">
          <h2>Execution bridge</h2>
          <Cpu size={15} aria-hidden="true" />
        </header>
        <div className="bridge-status">
          <span className="bridge-row">
            <Wifi size={14} aria-hidden="true" />
            <span>Public data</span>
            <b>OPEN</b>
          </span>
          <span className="bridge-row">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Outbound send</span>
            <b className="blocked">BLOCKED</b>
          </span>
          <span className="bridge-row">
            <Activity size={14} aria-hidden="true" />
            <span>UI stream</span>
            <b>{connected ? "LIVE" : "RECONNECTING"}</b>
          </span>
        </div>
        <p className="bridge-provider">
          {system?.researchProvider ?? "Connecting to provider status…"}
        </p>
      </section>

      <section className="truth-card">
        <p className="eyebrow">Truthfulness contract</p>
        <p>
          Statuses come from the server task record. A task is marked{" "}
          <strong>COMPLETED</strong> only after results are persisted and read back
          from disk. No agent animation implies work that did not happen.
        </p>
        <span className="truth-link">
          {system?.connectedClients ?? 0} interface stream
          {system?.connectedClients === 1 ? "" : "s"} connected
        </span>
      </section>
    </aside>
  );
}
