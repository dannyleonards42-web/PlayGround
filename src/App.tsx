import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BellRing,
  CheckCircle2,
  Database,
  LayoutDashboard,
  Radio,
  Server,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  CreateResearchRequest,
  SystemStatus,
  Task,
  TaskStatus,
} from "./types.ts";
import {
  decideTask,
  fetchSystem,
  fetchTasks,
  retryTask,
  submitOutreach,
  submitResearch,
} from "./api.ts";
import { AgentRail } from "./components/AgentRail.tsx";
import { AssignmentForm } from "./components/AssignmentForm.tsx";
import { NoTasksBrief, TaskDetail } from "./components/TaskDetail.tsx";
import { TaskQueue } from "./components/TaskQueue.tsx";
import { ApprovalsView, SystemView } from "./components/Views.tsx";
import { formatTimestamp } from "./components/ui.tsx";

type View = "operations" | "approvals" | "system";

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error" | "info";
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<View>("operations");
  const [streamLive, setStreamLive] = useState(false);
  const [connectedClients, setConnectedClients] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [clock, setClock] = useState(() => new Date());

  const notify = useCallback((message: string, tone: Toast["tone"] = "info") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [nextTasks, nextSystem] = await Promise.all([
        fetchTasks(),
        fetchSystem(),
      ]);
      setTasks(nextTasks);
      setSystem(nextSystem);
      setConnectedClients(nextSystem.connectedClients);
      setSelectedId((current) => current ?? nextTasks[0]?.id ?? null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to reach the HQ server.",
      );
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      source = new EventSource("/api/events");
      source.onopen = () => {
        setStreamLive(true);
        void fetchSystem()
          .then((next) => {
            setSystem(next);
            setConnectedClients(next.connectedClients);
          })
          .catch(() => undefined);
      };
      source.onerror = () => {
        setStreamLive(false);
      };
      source.addEventListener("snapshot", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            tasks: Task[];
            connectedClients: number;
          };
          setTasks(
            [...data.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
          );
          setConnectedClients(data.connectedClients);
          setSelectedId((current) => current ?? data.tasks[0]?.id ?? null);
          setStreamLive(true);
          setInitialLoading(false);
        } catch {
          // Ignore malformed stream frames; HTTP state remains authoritative.
        }
      });
      source.addEventListener("task", (event) => {
        try {
          const task = JSON.parse((event as MessageEvent).data) as Task;
          setTasks((current) => {
            const next = [task, ...current.filter((item) => item.id !== task.id)];
            return next.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          });
        } catch {
          // Ignore malformed frame.
        }
      });
      source.addEventListener("system", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as {
            connectedClients?: number;
          };
          if (typeof data.connectedClients === "number") {
            setConnectedClients(data.connectedClients);
          }
        } catch {
          // Ignore malformed frame.
        }
      });
    };

    connect();
    retry = setInterval(() => {
      if (source?.readyState === EventSource.CLOSED) {
        connect();
      }
    }, 8000);

    return () => {
      source?.close();
      if (retry) clearInterval(retry);
    };
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [tasks, selectedId],
  );

  const counts = useMemo(() => {
    const base: Record<TaskStatus, number> = {
      QUEUED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      FAILED: 0,
      AWAITING_APPROVAL: 0,
    };
    for (const task of tasks) base[task.status] += 1;
    return base;
  }, [tasks]);

  const deliveredProspects = useMemo(
    () =>
      tasks.reduce((total, task) => {
        if (
          task.status === "COMPLETED" &&
          task.result &&
          "prospects" in task.result
        ) {
          return total + task.result.prospects.length;
        }
        return total;
      }, 0),
    [tasks],
  );

  const handleResearch = async (input: CreateResearchRequest) => {
    setSubmitting(true);
    try {
      const task = await submitResearch(input);
      setTasks((current) => [
        task,
        ...current.filter((item) => item.id !== task.id),
      ]);
      setSelectedId(task.id);
      setView("operations");
      notify(`Task ${task.id} queued for NOVA.`, "info");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not submit the task.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (id: string) => {
    setActionBusy(true);
    try {
      const task = await retryTask(id);
      setTasks((current) => [
        task,
        ...current.filter((item) => item.id !== task.id),
      ]);
      setSelectedId(task.id);
      notify("Retry accepted and re-queued.", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Retry failed.", "error");
    } finally {
      setActionBusy(false);
    }
  };

  const handleOutreach = async (parentTaskId: string, prospectId: string) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const task = await submitOutreach(parentTaskId, prospectId);
      setTasks((current) => [
        task,
        ...current.filter((item) => item.id !== task.id),
      ]);
      setSelectedId(task.id);
      setView("operations");
      notify("Local draft created. Awaiting operator approval — nothing sent.", "info");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not create the draft.",
        "error",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleDecision = async (
    id: string,
    decision: "APPROVE" | "REJECT",
    note: string,
  ) => {
    setActionBusy(true);
    try {
      const task = await decideTask(id, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setTasks((current) => [
        task,
        ...current.filter((item) => item.id !== task.id),
      ]);
      notify(
        decision === "APPROVE"
          ? "Draft approved for manual use. No message was sent."
          : "Draft rejected. No message was sent.",
        decision === "APPROVE" ? "ok" : "info",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Decision could not be recorded.",
        "error",
      );
    } finally {
      setActionBusy(false);
    }
  };

  const sysWithClients = system
    ? { ...system, connectedClients }
    : null;

  const openTask = (id: string) => {
    setSelectedId(id);
    setView("operations");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span>AH</span>
          </span>
          <div>
            <p className="brand-name">AGENT // HQ</p>
            <p className="brand-sub">DEEMANNIE&apos;S DIGITAL · OPERATIONS</p>
          </div>
        </div>

        <nav className="main-nav" aria-label="Primary">
          <button
            type="button"
            className={view === "operations" ? "nav-active" : ""}
            onClick={() => setView("operations")}
          >
            <LayoutDashboard size={15} aria-hidden="true" />
            Operations
          </button>
          <button
            type="button"
            className={view === "approvals" ? "nav-active" : ""}
            onClick={() => setView("approvals")}
          >
            <ShieldAlert size={15} aria-hidden="true" />
            Approvals
            {counts.AWAITING_APPROVAL > 0 ? (
              <span className="nav-badge">{counts.AWAITING_APPROVAL}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={view === "system" ? "nav-active" : ""}
            onClick={() => setView("system")}
          >
            <Server size={15} aria-hidden="true" />
            System
          </button>
        </nav>

        <div className="topbar-status">
          <span className={`live-pill ${streamLive ? "live-on" : "live-off"}`}>
            <Radio size={13} aria-hidden="true" />
            {streamLive ? "STREAM LIVE" : "HTTP ONLY"}
          </span>
          <span className="utc-clock">
            {formatTimestamp(clock.toISOString()).replace(" UTC", "")}
            <em>UTC</em>
          </span>
        </div>
      </header>

      <div className="shell">
        <AgentRail
          tasks={tasks}
          system={sysWithClients}
          connected={streamLive}
        />

        <main className="main">
          {loadError ? (
            <div className="load-error" role="alert">
              <ShieldAlert size={18} />
              <div>
                <strong>HQ server unreachable</strong>
                <p>{loadError}</p>
              </div>
              <button type="button" onClick={() => void loadData()}>
                Reconnect
              </button>
            </div>
          ) : null}

          {view === "operations" ? (
            <>
              <section className="page-intro ops-intro">
                <div>
                  <p className="eyebrow">Mission control</p>
                  <h1>Live operations</h1>
                  <p>
                    Assign real public-data research. Watch the execution record,
                    inspect the evidence, and keep outreach behind a human gate.
                  </p>
                </div>
                <div className="intro-seal">
                  <ShieldCheck size={18} aria-hidden="true" />
                  <div>
                    <strong>NO SIMULATED RUNS</strong>
                    <span>Statuses are server-verified</span>
                  </div>
                </div>
              </section>

              <AssignmentForm onSubmit={handleResearch} busy={submitting} />

              <div className="stats-strip">
                <div>
                  <Activity size={15} aria-hidden="true" />
                  <span>Active</span>
                  <strong>{counts.QUEUED + counts.RUNNING}</strong>
                </div>
                <div>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>Completed</span>
                  <strong>{counts.COMPLETED}</strong>
                </div>
                <div>
                  <Database size={15} aria-hidden="true" />
                  <span>Prospects delivered</span>
                  <strong>{deliveredProspects}</strong>
                </div>
                <div>
                  <BellRing size={15} aria-hidden="true" />
                  <span>Approvals</span>
                  <strong>{counts.AWAITING_APPROVAL}</strong>
                </div>
                <div>
                  <Radio size={15} aria-hidden="true" />
                  <span>SSE clients</span>
                  <strong>{connectedClients}</strong>
                </div>
              </div>

              {initialLoading ? (
                <div className="boot-panel">
                  <span className="boot-scan" />
                  <p>Connecting to the HQ task store…</p>
                </div>
              ) : (
                <div className="ops-grid">
                  <TaskQueue
                    tasks={tasks}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                  {tasks.length === 0 ? (
                    <NoTasksBrief />
                  ) : (
                    <TaskDetail
                      task={selectedTask}
                      onRetry={handleRetry}
                      onOutreach={handleOutreach}
                      onDecision={handleDecision}
                      busy={actionBusy}
                      connectedClients={connectedClients}
                    />
                  )}
                </div>
              )}
            </>
          ) : null}

          {view === "approvals" ? (
            <ApprovalsView tasks={tasks} onSelect={openTask} />
          ) : null}

          {view === "system" ? <SystemView system={sysWithClients} /> : null}

          <footer className="foot">
            <span>
              AGENT HQ v2.0 · DEEMANNIE&apos;S DIGITAL ·{" "}
              {tasks.length} durable task{tasks.length === 1 ? "" : "s"} · last
              sync {formatTimestamp(clock.toISOString())}
            </span>
            <span>No hidden sends. No fabricated evidence.</span>
          </footer>
        </main>
      </div>

      {toast ? (
        <div className={`toast toast-${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
