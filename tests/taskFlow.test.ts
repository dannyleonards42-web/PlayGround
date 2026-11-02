import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import type { Response } from "express";
import type { Task } from "../shared/types.ts";
import { createApp } from "../server/app.ts";
import { HqBus } from "../server/bus.ts";
import { HqRunner } from "../server/runner.ts";
import { TaskStore } from "../server/store.ts";
import { FakeResearchProvider, waitFor } from "./helpers.ts";

interface Harness {
  store: TaskStore;
  bus: HqBus;
  provider: FakeResearchProvider;
  runner: HqRunner;
  app: ReturnType<typeof createApp>;
}

async function harness(store?: TaskStore): Promise<Harness> {
  const taskStore = store ?? new TaskStore(null);
  await taskStore.init();
  const bus = new HqBus();
  const provider = new FakeResearchProvider();
  const runner = new HqRunner({
    store: taskStore,
    provider,
    bus,
    mode: "TEST",
  });
  const app = createApp({
    store: taskStore,
    runner,
    bus,
    version: "test",
    startedAt: new Date().toISOString(),
    researchProvider: provider.name,
    enableRateLimit: false,
    staticDir: null,
  });
  return { store: taskStore, bus, provider, runner, app };
}

async function getTask(app: Harness["app"], id: string): Promise<Task> {
  const response = await request(app).get(`/api/tasks/${id}`);
  expect(response.status).toBe(200);
  return response.body.task as Task;
}

async function waitForStatus(
  app: Harness["app"],
  id: string,
  status: Task["status"],
): Promise<Task> {
  let latest: Task | null = null;
  await waitFor(async () => {
    latest = await getTask(app, id);
    return latest.status === status;
  });
  return latest!;
}

async function submit(
  h: Harness,
  overrides: Record<string, unknown> = {},
): Promise<Task> {
  const response = await request(h.app)
    .post("/api/tasks/research")
    .send({ city: "Galway, Ireland", category: "cafe", count: 3, ...overrides });
  expect(response.status).toBe(202);
  return response.body.task as Task;
}

describe("research task submission and execution", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await harness();
  });

  it("rejects invalid submissions with a useful error", async () => {
    const shortCity = await request(h.app)
      .post("/api/tasks/research")
      .send({ city: "A", category: "cafe", count: 3 });
    expect(shortCity.status).toBe(400);
    expect(shortCity.body.error.code).toBe("INVALID_INPUT");

    const badCategory = await request(h.app)
      .post("/api/tasks/research")
      .send({ city: "Galway", category: "casino", count: 3 });
    expect(badCategory.status).toBe(400);

    const badCount = await request(h.app)
      .post("/api/tasks/research")
      .send({ city: "Galway", category: "cafe", count: 9 });
    expect(badCount.status).toBe(400);

    const missing = await request(h.app).get("/api/tasks/TSK-NOPE");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("TASK_NOT_FOUND");
  });

  it("queues, executes, verifies delivery, and serves the stored result", async () => {
    const accepted = await submit(h);
    expect(accepted.status).toBe("QUEUED");
    expect(accepted.execution.mode).toBe("TEST");

    const completed = await waitForStatus(h.app, accepted.id, "COMPLETED");
    expect(completed.startedAt).toBeTruthy();
    expect(completed.completedAt).toBeTruthy();
    expect(completed.delivery.persisted).toBe(true);
    expect(completed.delivery.readbackVerified).toBe(true);
    expect(completed.delivery.verifiedAt).toBeTruthy();
    expect(completed.delivery.apiPath).toBe(`/api/tasks/${accepted.id}`);
    expect(completed.error).toBeNull();

    expect(completed.result).not.toBeNull();
    if (!completed.result || !("prospects" in completed.result)) {
      throw new Error("Expected a research result");
    }
    expect(completed.result.prospects).toHaveLength(3);
    expect(completed.result.prospects[0].sources.length).toBeGreaterThan(0);
    expect(
      completed.events.some((event) => event.status === "QUEUED"),
    ).toBe(true);
    expect(
      completed.events.some((event) => event.status === "RUNNING"),
    ).toBe(true);
    expect(
      completed.events.some((event) => event.kind === "DELIVERY"),
    ).toBe(true);
    expect(h.provider.calls).toBe(1);

    const apiResponse = await request(h.app).get(`/api/tasks/${accepted.id}`);
    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body.task.status).toBe("COMPLETED");
    expect(apiResponse.body.task.result.prospects).toHaveLength(3);

    const disk = await h.store.readFromDisk(accepted.id);
    expect(disk?.status).toBe("COMPLETED");
    expect(disk?.result).not.toBeNull();
  });

  it("keeps a failure visible and retries it successfully", async () => {
    h.provider.failNext = 1;
    const accepted = await submit(h, { count: 2 });
    const failed = await waitForStatus(h.app, accepted.id, "FAILED");

    expect(failed.error).not.toBeNull();
    expect(failed.error?.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(failed.error?.retryable).toBe(true);
    expect(failed.error?.detail).toContain("Simulated upstream timeout");
    expect(failed.result).toBeNull();
    expect(failed.delivery.readbackVerified).toBe(false);
    expect(failed.progress.stage).toBe("FAILED");

    const retried = await request(h.app).post(
      `/api/tasks/${accepted.id}/retry`,
    );
    expect(retried.status).toBe(202);
    expect(retried.body.task.status).toBe("QUEUED");
    expect(retried.body.task.error).toBeNull();

    const completed = await waitForStatus(h.app, accepted.id, "COMPLETED");
    expect(completed.execution.attemptedPasses).toBe(2);
    expect(completed.completedAt).toBeTruthy();
    expect(h.provider.calls).toBe(2);
  });

  it("does not allow retry of a non-failed task", async () => {
    const accepted = await submit(h, { count: 1 });
    const response = await request(h.app).post(
      `/api/tasks/${accepted.id}/retry`,
    );
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("TASK_NOT_RETRYABLE");
  });
});

describe("delivery verification", () => {
  it("fails instead of reporting COMPLETED when read-back does not match", async () => {
    class BrokenReadbackStore extends TaskStore {
      async readFromDisk(): Promise<Task | null> {
        return null;
      }
    }
    const store = new BrokenReadbackStore(null);
    const h = await harness(store);
    const accepted = await submit(h, { count: 1 });
    const failed = await waitForStatus(h.app, accepted.id, "FAILED");

    expect(failed.error?.code).toBe("DELIVERY_UNVERIFIED");
    expect(failed.delivery.readbackVerified).toBe(false);
    expect(failed.result).toBeNull();
    expect(failed.status).not.toBe("COMPLETED");
  });
});

describe("approval gate", () => {
  let h: Harness;
  let completed: Task;
  let prospectId: string;

  beforeEach(async () => {
    h = await harness();
    const accepted = await submit(h, { count: 1 });
    completed = await waitForStatus(h.app, accepted.id, "COMPLETED");
    const result = completed.result;
    if (!result || !("prospects" in result)) {
      throw new Error("Expected a research result");
    }
    prospectId = result.prospects[0].id;
  });

  it("creates an AWAITING_APPROVAL draft and only completes on approval", async () => {
    const created = await request(h.app).post("/api/tasks/outreach").send({
      parentTaskId: completed.id,
      prospectId,
    });
    expect(created.status).toBe(201);
    const draftTask = created.body.task as Task;
    expect(draftTask.status).toBe("AWAITING_APPROVAL");
    expect(draftTask.result).not.toBeNull();
    if (!draftTask.result || !("draft" in draftTask.result)) {
      throw new Error("Expected an outreach draft");
    }
    expect(draftTask.result.sent).toBe(false);
    expect(draftTask.result.draft.body).toContain("Nothing has been sent");
    expect(draftTask.approval?.status).toBe("PENDING");
    expect(draftTask.delivery.readbackVerified).toBe(true);

    const approved = await request(h.app)
      .post(`/api/tasks/${draftTask.id}/decision`)
      .send({ decision: "APPROVE", note: "Looks accurate." });
    expect(approved.status).toBe(200);
    expect(approved.body.task.status).toBe("COMPLETED");
    expect(approved.body.task.approval.status).toBe("APPROVED");
    expect(approved.body.task.approval.note).toBe("Looks accurate.");
    expect(approved.body.task.result.sent).toBe(false);
    expect(
      approved.body.task.events.some((event: { message: string }) =>
        event.message.includes("nothing was sent"),
      ),
    ).toBe(true);

    const again = await request(h.app)
      .post(`/api/tasks/${draftTask.id}/decision`)
      .send({ decision: "APPROVE" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("NO_PENDING_APPROVAL");
  });

  it("marks a rejected draft FAILED and blocks retry", async () => {
    const created = await request(h.app).post("/api/tasks/outreach").send({
      parentTaskId: completed.id,
      prospectId,
    });
    const draftTask = created.body.task as Task;

    const rejected = await request(h.app)
      .post(`/api/tasks/${draftTask.id}/decision`)
      .send({ decision: "REJECT", note: "Tone is wrong." });
    expect(rejected.status).toBe(200);
    expect(rejected.body.task.status).toBe("FAILED");
    expect(rejected.body.task.error.code).toBe("REJECTED_BY_OPERATOR");
    expect(rejected.body.task.error.retryable).toBe(false);

    const retry = await request(h.app).post(
      `/api/tasks/${draftTask.id}/retry`,
    );
    expect(retry.status).toBe(409);
  });

  it("rejects outreach for a prospect outside the parent task", async () => {
    const response = await request(h.app).post("/api/tasks/outreach").send({
      parentTaskId: completed.id,
      prospectId: "PRS-NOT-REAL",
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PROSPECT_NOT_FOUND");
  });
});

describe("interface delivery stream", () => {
  it("broadcasts the full task record to subscribed clients", async () => {
    const h = await harness();
    const accepted = await submit(h, { count: 1 });
    const chunks: string[] = [];
    const fakeResponse = {
      write: (chunk: string) => {
        chunks.push(chunk);
        return true;
      },
      end: () => undefined,
    } as unknown as Response;

    const unsubscribe = h.bus.subscribe(fakeResponse);
    expect(h.bus.clientCount).toBe(1);
    const delivered = h.bus.broadcastTask(accepted);
    expect(delivered).toBe(1);
    expect(chunks.join("")).toContain("event: task");
    expect(chunks.join("")).toContain(accepted.id);
    unsubscribe();
    expect(h.bus.clientCount).toBe(0);
  });

  it("serves an initial SSE snapshot over HTTP", async () => {
    const h = await harness();
    const accepted = await submit(h, { count: 1 });
    const server = h.app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    const controller = new AbortController();
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/events`,
        { signal: controller.signal },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No SSE body");
      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3_000;
      while (!text.includes("event: snapshot") && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      expect(text).toContain("event: snapshot");
      expect(text).toContain(accepted.id);
    } finally {
      controller.abort();
      server.close();
    }
  });
});
