import { useMemo, useState } from "react";
import { ChevronRight, Inbox, ListFilter } from "lucide-react";
import type { Task } from "../types.ts";
import {
  STATUS_META,
  StatusBadge,
  formatTimestamp,
  shortId,
} from "./ui.tsx";

type Filter = "ALL" | "ACTIVE" | "COMPLETED" | "FAILED" | "APPROVAL";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Done" },
  { value: "FAILED", label: "Failed" },
  { value: "APPROVAL", label: "Approval" },
];

export function TaskQueue({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === "ALL") return true;
      if (filter === "ACTIVE")
        return task.status === "QUEUED" || task.status === "RUNNING";
      if (filter === "APPROVAL") return task.status === "AWAITING_APPROVAL";
      return task.status === filter;
    });
  }, [tasks, filter]);

  return (
    <section className="queue panel" aria-label="Task queue">
      <header className="queue-head">
        <div>
          <p className="eyebrow">Durable queue</p>
          <h2>Assignments</h2>
        </div>
        <span className="queue-total">{tasks.length}</span>
      </header>

      <div className="filter-row" role="group" aria-label="Filter assignments">
        <ListFilter size={13} aria-hidden="true" />
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={filter === item.value ? "filter-active" : ""}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="task-list">
        {visible.length === 0 ? (
          <div className="queue-empty">
            <Inbox size={26} aria-hidden="true" />
            <p>
              {tasks.length === 0
                ? "No assignments yet. NOVA is standing by."
                : "No assignments match this filter."}
            </p>
          </div>
        ) : (
          visible.map((task) => {
            const meta = STATUS_META[task.status];
            const result = task.result;
            const prospectCount =
              result && "prospects" in result ? result.prospects.length : null;
            return (
              <button
                type="button"
                key={task.id}
                className={`task-row ${selectedId === task.id ? "task-selected" : ""}`}
                onClick={() => onSelect(task.id)}
              >
                <span className={`task-status-line ${meta.className}`} />
                <span className="task-main">
                  <span className="task-title-row">
                    <span className="task-id">{shortId(task.id)}</span>
                    <StatusBadge status={task.status} />
                  </span>
                  <strong className="task-title">{task.title}</strong>
                  <span className="task-meta">
                    {task.type === "PROSPECT_RESEARCH" ? "NOVA · research" : "ECHO · draft"} ·{" "}
                    {formatTimestamp(task.createdAt)}
                    {prospectCount !== null
                      ? ` · ${prospectCount} prospect${prospectCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                  {task.status === "RUNNING" ? (
                    <span className="mini-progress">
                      <span style={{ width: `${task.progress.percent}%` }} />
                    </span>
                  ) : null}
                  {task.status === "FAILED" && task.error ? (
                    <span className="task-error-line">
                      {task.error.code} · {task.error.message}
                    </span>
                  ) : null}
                  {task.status === "AWAITING_APPROVAL" ? (
                    <span className="task-approval-line">
                      Operator decision required
                    </span>
                  ) : null}
                </span>
                <ChevronRight size={16} className="task-chevron" aria-hidden="true" />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
