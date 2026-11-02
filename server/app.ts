import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { SystemStatus, TaskStatus } from "../shared/types.ts";
import type { HqBus } from "./bus.ts";
import { HqRunner, RunnerError, countStatuses } from "./runner.ts";
import type { TaskStore } from "./store.ts";

export interface AppOptions {
  store: TaskStore;
  runner: HqRunner;
  bus: HqBus;
  version: string;
  startedAt: string;
  researchProvider: string;
  enableRateLimit?: boolean;
  staticDir?: string | null;
}

const researchSchema = z.object({
  city: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine((value) => !/[\u0000-\u001f]/.test(value), "City contains control characters"),
  category: z.enum(["cafe", "restaurant", "bakery"]),
  count: z.number().int().min(1).max(5).default(3),
});

const outreachSchema = z.object({
  parentTaskId: z.string().trim().min(3).max(40),
  prospectId: z.string().trim().min(3).max(80),
});

const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function errorBody(code: string, message: string, detail?: string | null) {
  return { error: { code, message, detail: detail ?? null } };
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    next();
  });

  const attempts = new Map<string, number[]>();
  const rateLimit =
    options.enableRateLimit === false
      ? (_req: Request, _res: Response, next: NextFunction) => next()
      : (req: Request, res: Response, next: NextFunction) => {
          if (req.method !== "POST") return next();
          const key = req.ip ?? "unknown";
          const now = Date.now();
          const recent = (attempts.get(key) ?? []).filter(
            (stamp) => now - stamp < 60_000,
          );
          if (recent.length >= 8) {
            res
              .status(429)
              .json(
                errorBody(
                  "RATE_LIMITED",
                  "Too many submissions. Wait a minute and retry.",
                ),
              );
            return;
          }
          recent.push(now);
          attempts.set(key, recent);
          next();
        };
  app.use(rateLimit);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      version: options.version,
    });
  });

  app.get("/api/system", (_req, res) => {
    const tasks = options.store.list();
    const system: SystemStatus = {
      mode: "LIVE",
      version: options.version,
      startedAt: options.startedAt,
      researchProvider: options.researchProvider,
      approvalPolicy:
        "Outreach drafts require operator approval. No send, publish, or payment bridge is configured.",
      connectedClients: options.bus.clientCount,
      taskCounts: countStatuses(tasks),
      capabilities: [
        {
          id: "live-research",
          label: "Open-data prospect research",
          status: "LIVE",
          detail: options.researchProvider,
        },
        {
          id: "website-audit",
          label: "Public homepage audit",
          status: "LIVE",
          detail: "HTTP fetch, capped HTML analysis, evidence hashes",
        },
        {
          id: "outreach-draft",
          label: "Outreach drafts",
          status: "LIVE",
          detail: "Local drafts only; approval gate enforced",
        },
        {
          id: "email-send",
          label: "Email delivery",
          status: "BLOCKED",
          detail: "No email provider or credentials configured",
        },
        {
          id: "website-publish",
          label: "Website publishing",
          status: "BLOCKED",
          detail: "No deployment target or approval workflow configured",
        },
        {
          id: "payments",
          label: "Payments and spend",
          status: "BLOCKED",
          detail: "No payment service configured",
        },
      ],
    };
    res.json(system);
  });

  app.get("/api/tasks", (_req, res) => {
    res.json({ tasks: options.store.list() });
  });

  app.get("/api/tasks/:id", (req, res) => {
    const task = options.store.get(req.params.id);
    if (!task) {
      res
        .status(404)
        .json(errorBody("TASK_NOT_FOUND", "No task exists with that id."));
      return;
    }
    res.json({ task });
  });

  app.post(
    "/api/tasks/research",
    asyncHandler(async (req, res) => {
      const parsed = researchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(
          errorBody(
            "INVALID_INPUT",
            "The research assignment is invalid.",
            parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          ),
        );
        return;
      }
      const task = await options.runner.submitResearch(parsed.data);
      res.status(202).json({ task });
    }),
  );

  app.post(
    "/api/tasks/outreach",
    asyncHandler(async (req, res) => {
      const parsed = outreachSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(
          errorBody(
            "INVALID_INPUT",
            "The outreach request is invalid.",
            parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; "),
          ),
        );
        return;
      }
      const task = await options.runner.submitOutreach(
        parsed.data.parentTaskId,
        parsed.data.prospectId,
      );
      res.status(201).json({ task });
    }),
  );

  app.post(
    "/api/tasks/:id/retry",
    asyncHandler(async (req, res) => {
      const task = await options.runner.retry(String(req.params.id));
      res.status(202).json({ task });
    }),
  );

  app.post(
    "/api/tasks/:id/decision",
    asyncHandler(async (req, res) => {
      const parsed = decisionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json(
          errorBody(
            "INVALID_INPUT",
            "Decision is invalid.",
            parsed.error.issues.map((issue) => issue.message).join("; "),
          ),
        );
        return;
      }
      const task = await options.runner.decide(
        String(req.params.id),
        parsed.data.decision,
        parsed.data.note,
      );
      res.json({ task });
    }),
  );

  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("snapshot", {
      tasks: options.store.list(),
      connectedClients: options.bus.clientCount + 1,
      at: new Date().toISOString(),
    });
    const unsubscribe = options.bus.subscribe(res);
    const broadcastCount = () => {
      options.bus.broadcastSystem({
        connectedClients: options.bus.clientCount,
        at: new Date().toISOString(),
      });
    };
    broadcastCount();
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      broadcastCount();
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json(errorBody("NOT_FOUND", "Unknown API route."));
  });

  if (options.staticDir && fs.existsSync(options.staticDir)) {
    app.use(express.static(options.staticDir, { index: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(options.staticDir!, "index.html"));
    });
  }

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof RunnerError) {
        res
          .status(error.status)
          .json(errorBody(error.code, error.message, error.detail));
        return;
      }
      if (error instanceof SyntaxError && "body" in error) {
        res
          .status(400)
          .json(errorBody("INVALID_JSON", "Request body must be valid JSON."));
        return;
      }
      console.error("[hq] unhandled request error:", error);
      res
        .status(500)
        .json(
          errorBody(
            "INTERNAL_ERROR",
            "AGENT HQ hit an unexpected server error.",
            error instanceof Error ? error.message : String(error),
          ),
        );
    },
  );

  return app;
}

export function emptyCounts(): Record<TaskStatus, number> {
  return {
    QUEUED: 0,
    RUNNING: 0,
    COMPLETED: 0,
    FAILED: 0,
    AWAITING_APPROVAL: 0,
  };
}
