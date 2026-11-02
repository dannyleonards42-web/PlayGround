import type {
  OutreachDraftResult,
  Prospect,
  ResearchInput,
  ResearchResult,
  Task,
  TaskStatus,
} from "../shared/types.ts";
import { eventId, nowIso, taskId } from "./ids.ts";
import type { HqBus } from "./bus.ts";
import type { TaskStore } from "./store.ts";
import {
  ResearchExecutionError,
  type ResearchProvider,
} from "./research/liveResearch.ts";

export interface RunnerOptions {
  store: TaskStore;
  provider: ResearchProvider;
  bus: HqBus;
  mode: "LIVE" | "TEST";
}

export class HqRunner {
  private queue: string[] = [];
  private draining = false;
  private stopped = false;

  constructor(private readonly options: RunnerOptions) {}

  async submitResearch(input: ResearchInput): Promise<Task> {
    const timestamp = nowIso();
    const task: Task = {
      id: taskId(),
      type: "PROSPECT_RESEARCH",
      title: `Prospect research — ${input.count} ${input.category}s in ${input.city}`,
      brief: `Find and verify ${input.count} ${input.category} prospects in ${input.city}. Capture official-site evidence, observable online-presence gaps, sources, and timestamps. No outreach.`,
      input,
      status: "QUEUED",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      progress: {
        stage: "QUEUED",
        message: "Waiting for NOVA's execution worker.",
        percent: 0,
      },
      events: [
        {
          id: eventId(),
          at: timestamp,
          kind: "STATUS",
          message: "Task accepted into the durable queue.",
          status: "QUEUED",
        },
      ],
      execution: {
        provider: this.options.provider.name,
        mode: this.options.mode,
        attemptedPasses: 0,
      },
      result: null,
      error: null,
      approval: null,
      delivery: {
        persisted: false,
        persistedAt: null,
        readbackVerified: false,
        verifiedAt: null,
        broadcastClients: 0,
        apiPath: "/api/tasks/",
      },
    };
    await this.options.store.upsert(task);
    this.options.bus.broadcastTask(task);
    this.queue.push(task.id);
    queueMicrotask(() => void this.drain());
    return structuredClone(task);
  }

  async submitOutreach(parentTaskId: string, prospectId: string): Promise<Task> {
    const parent = this.options.store.get(parentTaskId);
    if (!parent) {
      throw new RunnerError("PARENT_NOT_FOUND", "The research task was not found.", 404);
    }
    if (parent.status !== "COMPLETED" || !parent.result) {
      throw new RunnerError(
        "PARENT_NOT_COMPLETED",
        "Outreach can only be drafted from a COMPLETED research task.",
        409,
      );
    }
    const research = parent.result as ResearchResult;
    const prospect = research.prospects?.find((item) => item.id === prospectId);
    if (!prospect) {
      throw new RunnerError(
        "PROSPECT_NOT_FOUND",
        "That prospect does not belong to the parent research task.",
        404,
      );
    }

    const timestamp = nowIso();
    const draft = buildDraft(prospect);
    const result: OutreachDraftResult = {
      prospectId: prospect.id,
      businessName: prospect.businessName,
      draft,
      approval: {
        status: "PENDING",
        requestedAt: timestamp,
        decidedAt: null,
        note: null,
      },
      sent: false,
      note: "This is a local draft only. AGENT HQ has no outbound-message capability and nothing was sent.",
    };
    const task: Task = {
      id: taskId(),
      type: "OUTREACH_DRAFT",
      title: `Outreach draft — ${prospect.businessName}`,
      brief:
        "Prepare a local outreach draft from verified research. Requires operator approval; no send bridge exists.",
      input: { prospectId, parentTaskId },
      status: "AWAITING_APPROVAL",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      progress: {
        stage: "APPROVAL_GATE",
        message: "Draft prepared locally. Awaiting operator decision.",
        percent: 100,
      },
      events: [
        {
          id: eventId(),
          at: timestamp,
          kind: "STATUS",
          message:
            "Draft prepared from stored evidence. Awaiting approval; no message sent.",
          status: "AWAITING_APPROVAL",
        },
      ],
      execution: {
        provider: "manual-approval-gate",
        mode: this.options.mode,
        attemptedPasses: 0,
      },
      result,
      error: null,
      approval: {
        status: "PENDING",
        requestedAt: timestamp,
        decidedAt: null,
        note: null,
        scope:
          "Approval authorises manual use of this draft. AGENT HQ cannot send email or publish anything.",
      },
      delivery: {
        persisted: false,
        persistedAt: null,
        readbackVerified: false,
        verifiedAt: null,
        broadcastClients: 0,
        apiPath: "/api/tasks/",
      },
    };
    task.delivery.apiPath = `/api/tasks/${task.id}`;
    await this.options.store.upsert(task);
    const readback = await this.options.store.readFromDisk(task.id);
    task.delivery = {
      persisted: Boolean(readback?.result),
      persistedAt: timestamp,
      readbackVerified: Boolean(readback?.result),
      verifiedAt: nowIso(),
      broadcastClients: this.options.bus.broadcastTask(task),
      apiPath: `/api/tasks/${task.id}`,
    };
    await this.options.store.upsert(task);
    this.options.bus.broadcastTask(task);
    return structuredClone(task);
  }

  async retry(id: string): Promise<Task> {
    const task = this.options.store.get(id);
    if (!task) throw new RunnerError("TASK_NOT_FOUND", "Task not found.", 404);
    if (task.status !== "FAILED") {
      throw new RunnerError(
        "TASK_NOT_RETRYABLE",
        "Only FAILED tasks can be retried.",
        409,
        `Current status: ${task.status}.`,
      );
    }
    if (task.error && !task.error.retryable) {
      throw new RunnerError(
        "TASK_NOT_RETRYABLE",
        "This failure is marked non-retryable.",
        409,
        task.error.detail,
      );
    }
    if (task.type !== "PROSPECT_RESEARCH") {
      throw new RunnerError(
        "TASK_NOT_RETRYABLE",
        "Only research tasks have an automatic retry path.",
        409,
      );
    }
    const timestamp = nowIso();
    task.status = "QUEUED";
    task.updatedAt = timestamp;
    task.startedAt = null;
    task.completedAt = null;
    task.error = null;
    task.result = null;
    task.progress = {
      stage: "QUEUED",
      message: "Retry accepted. Waiting for the execution worker.",
      percent: 0,
    };
    task.delivery = {
      persisted: false,
      persistedAt: null,
      readbackVerified: false,
      verifiedAt: null,
      broadcastClients: 0,
      apiPath: `/api/tasks/${task.id}`,
    };
    task.events.push({
      id: eventId(),
      at: timestamp,
      kind: "STATUS",
      message: "Retry accepted by operator. Re-queued for execution.",
      status: "QUEUED",
    });
    await this.options.store.upsert(task);
    this.options.bus.broadcastTask(task);
    this.queue.push(task.id);
    queueMicrotask(() => void this.drain());
    return structuredClone(task);
  }

  async decide(
    id: string,
    decision: "APPROVE" | "REJECT",
    note?: string,
  ): Promise<Task> {
    const task = this.options.store.get(id);
    if (!task) throw new RunnerError("TASK_NOT_FOUND", "Task not found.", 404);
    if (task.status !== "AWAITING_APPROVAL") {
      throw new RunnerError(
        "NO_PENDING_APPROVAL",
        "This task has no pending approval.",
        409,
        `Current status: ${task.status}.`,
      );
    }
    if (!task.delivery.readbackVerified) {
      throw new RunnerError(
        "DELIVERY_UNVERIFIED",
        "This draft has not been verified as durably stored.",
        409,
        "Approval cannot be recorded for an unverified draft.",
      );
    }
    const timestamp = nowIso();
    const approved = decision === "APPROVE";
    if (task.approval) {
      task.approval.status = approved ? "APPROVED" : "REJECTED";
      task.approval.decidedAt = timestamp;
      task.approval.note = note?.trim() || null;
    }
    const result = task.result as OutreachDraftResult | null;
    if (result && "approval" in result) {
      result.approval.status = approved ? "APPROVED" : "REJECTED";
      result.approval.decidedAt = timestamp;
      result.approval.note = note?.trim() || null;
    }
    task.updatedAt = timestamp;
    if (approved) {
      task.status = "COMPLETED";
      task.completedAt = timestamp;
      task.progress = {
        stage: "APPROVED",
        message:
          "Draft approved for manual use. No message was sent by AGENT HQ.",
        percent: 100,
      };
      task.events.push({
        id: eventId(),
        at: timestamp,
        kind: "STATUS",
        message:
          "Operator approved the local draft. Execution bridge has no send capability; nothing was sent.",
        status: "COMPLETED",
      });
    } else {
      task.status = "FAILED";
      task.error = {
        code: "REJECTED_BY_OPERATOR",
        message: "The operator rejected this draft.",
        detail: note?.trim() || null,
        at: timestamp,
        retryable: false,
      };
      task.progress = {
        stage: "REJECTED",
        message: "Draft rejected. No message was sent.",
        percent: 100,
      };
      task.events.push({
        id: eventId(),
        at: timestamp,
        kind: "ERROR",
        message: "Operator rejected the draft. No message was sent.",
        status: "FAILED",
      });
    }
    await this.options.store.upsert(task);
    this.options.bus.broadcastTask(task);
    return structuredClone(task);
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  /**
   * Recovers durable state after a restart: interrupted RUNNING tasks become
   * retryable failures, and QUEUED tasks are placed back on the worker queue.
   */
  async recover(): Promise<void> {
    const tasks = this.options.store.list();
    for (const task of [...tasks].reverse()) {
      if (task.status === "RUNNING") {
        const timestamp = nowIso();
        task.status = "FAILED";
        task.updatedAt = timestamp;
        task.error = {
          code: "SERVER_RESTART",
          message: "Execution was interrupted by a server restart.",
          detail:
            "The task is safe to retry; no partial result was marked complete.",
          at: timestamp,
          retryable: true,
        };
        task.progress = {
          stage: "INTERRUPTED",
          message: "Interrupted by restart. Retry to resume.",
          percent: 0,
        };
        task.events.push({
          id: eventId(),
          at: timestamp,
          kind: "ERROR",
          message: "SERVER_RESTART: execution interrupted before completion.",
          status: "FAILED",
        });
        await this.options.store.upsert(task);
      } else if (task.status === "QUEUED" && task.type === "PROSPECT_RESEARCH") {
        const timestamp = nowIso();
        task.updatedAt = timestamp;
        task.events.push({
          id: eventId(),
          at: timestamp,
          kind: "STATUS",
          message: "Queued task restored from durable state after restart.",
          status: "QUEUED",
        });
        await this.options.store.upsert(task);
        this.queue.push(task.id);
      }
    }
    if (this.queue.length) queueMicrotask(() => void this.drain());
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const id = this.queue.shift();
        if (!id) continue;
        const task = this.options.store.get(id);
        if (!task || task.status !== "QUEUED") continue;
        await this.executeResearch(task);
      }
    } finally {
      this.draining = false;
    }
  }

  private async executeResearch(task: Task): Promise<void> {
    const startedAt = nowIso();
    task.status = "RUNNING";
    task.startedAt = startedAt;
    task.updatedAt = startedAt;
    task.execution.attemptedPasses += 1;
    task.progress = {
      stage: "STARTING",
      message: "NOVA acquired the task. Opening live data sources…",
      percent: 2,
    };
    task.events.push({
      id: eventId(),
      at: startedAt,
      kind: "STATUS",
      message: "Execution started by the live research bridge.",
      status: "RUNNING",
    });
    await this.options.store.upsert(task);
    this.options.bus.broadcastTask(task);

    try {
      const input = task.input as ResearchInput;
      const result = await this.options.provider.execute(input, {
        onProgress: async (stage, message, percent) => {
          const timestamp = nowIso();
          task.progress = { stage, message, percent };
          task.updatedAt = timestamp;
          task.events.push({
            id: eventId(),
            at: timestamp,
            kind: "PROGRESS",
            message,
          });
          await this.options.store.upsert(task);
          this.options.bus.broadcastTask(task);
        },
      });

      if (
        !result.prospects ||
        result.prospects.length !== input.count ||
        result.prospects.some((prospect) => !prospect.sources.length)
      ) {
        throw new ResearchExecutionError(
          "RESULT_INCOMPLETE",
          "The research result did not contain the required evidence-backed prospects.",
          `Expected ${input.count}; received ${result.prospects?.length ?? 0}.`,
          true,
        );
      }

      const persistedAt = nowIso();
      task.result = result;
      task.updatedAt = persistedAt;
      task.progress = {
        stage: "DELIVERY_CHECK",
        message: "Verifying results are durably stored and readable…",
        percent: 97,
      };
      task.delivery = {
        persisted: false,
        persistedAt,
        readbackVerified: false,
        verifiedAt: null,
        broadcastClients: 0,
        apiPath: `/api/tasks/${task.id}`,
      };
      await this.options.store.upsert(task);

      const readback = await this.options.store.readFromDisk(task.id);
      const readbackResult = readback?.result as ResearchResult | null;
      const verified =
        Boolean(readbackResult?.prospects) &&
        readbackResult?.prospects.length === input.count &&
        readbackResult.prospects.every(
          (prospect) =>
            prospect.businessName.length > 0 && prospect.sources.length > 0,
        );
      if (!verified) {
        throw new ResearchExecutionError(
          "DELIVERY_UNVERIFIED",
          "Stored results failed the read-back verification.",
          "The task was not marked COMPLETED. Re-run to regenerate the result.",
          true,
        );
      }

      const verifiedAt = nowIso();
      task.delivery = {
        persisted: true,
        persistedAt,
        readbackVerified: true,
        verifiedAt,
        broadcastClients: this.options.bus.broadcastTask(task),
        apiPath: `/api/tasks/${task.id}`,
      };
      task.events.push({
        id: eventId(),
        at: verifiedAt,
        kind: "DELIVERY",
        message: `Results persisted and read back successfully. Broadcast to ${task.delivery.broadcastClients} connected interface client(s).`,
      });
      task.status = "COMPLETED";
      task.completedAt = verifiedAt;
      task.updatedAt = verifiedAt;
      task.progress = {
        stage: "COMPLETED",
        message: `${result.prospects.length} verified prospects delivered with sources.`,
        percent: 100,
      };
      task.events.push({
        id: eventId(),
        at: verifiedAt,
        kind: "STATUS",
        message:
          "Task COMPLETED only after durable result read-back and interface delivery attempt.",
        status: "COMPLETED",
      });
      await this.options.store.upsert(task);
      this.options.bus.broadcastTask(task);
    } catch (error) {
      const timestamp = nowIso();
      const known =
        error instanceof ResearchExecutionError
          ? error
          : new ResearchExecutionError(
              "INTERNAL_ERROR",
              "The research bridge failed unexpectedly.",
              error instanceof Error ? error.message : String(error),
              true,
            );
      task.status = "FAILED";
      task.updatedAt = timestamp;
      task.completedAt = null;
      task.error = {
        code: known.code,
        message: known.message,
        detail: known.detail,
        at: timestamp,
        retryable: known.retryable,
      };
      task.progress = {
        stage: "FAILED",
        message: known.message,
        percent: 100,
      };
      task.events.push({
        id: eventId(),
        at: timestamp,
        kind: "ERROR",
        message: `${known.code}: ${known.message}`,
        status: "FAILED",
      });
      // A failed run must not retain results from an earlier pass.
      task.result = null;
      task.delivery = {
        persisted: false,
        persistedAt: null,
        readbackVerified: false,
        verifiedAt: null,
        broadcastClients: 0,
        apiPath: `/api/tasks/${task.id}`,
      };
      await this.options.store.upsert(task);
      this.options.bus.broadcastTask(task);
    }
  }
}

export class RunnerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly detail: string | null = null,
  ) {
    super(message);
    this.name = "RunnerError";
  }
}

function buildDraft(prospect: Prospect): OutreachDraftResult["draft"] {
  const topSignals = prospect.opportunity.signals
    .slice(0, 2)
    .map((signal) => signal.label);
  const observations = topSignals.length
    ? topSignals.map((label) => `- ${label}`).join("\n")
    : "- No material technical gap was observed.";
  const body = `Hello ${prospect.businessName} team,

I am writing from DEEMANNIE'S DIGITAL. While reviewing publicly available information about ${prospect.businessName} in ${prospect.location.city}, I recorded the following observations on your public website:

${observations}

Evidence reviewed: ${prospect.website.finalUrl ?? prospect.website.url ?? "no official website found"}

These are technical observations, not assumptions about your plans. If useful, I can share a short audit with the supporting evidence. If this is not relevant, no reply is needed.

This draft was prepared by AGENT HQ and requires human approval. Nothing has been sent.

DEEMANNIE'S DIGITAL`;

  return {
    subject: `A website observation for ${prospect.businessName}`,
    body,
    channel: "email",
  };
}

export function countStatuses(tasks: Task[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    QUEUED: 0,
    RUNNING: 0,
    COMPLETED: 0,
    FAILED: 0,
    AWAITING_APPROVAL: 0,
  };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}
