import path from "node:path";
import { createApp } from "./app.ts";
import { HqBus } from "./bus.ts";
import { LiveResearchProvider } from "./research/liveResearch.ts";
import { HqRunner } from "./runner.ts";
import { TaskStore } from "./store.ts";

const PORT = Number(process.env.PORT ?? 3002);
const DATA_DIR = process.env.HQ_DATA_DIR ?? path.resolve(process.cwd(), "data");
const VERSION = "2.0.0";
const MODE = process.env.HQ_MODE === "TEST" ? "TEST" : "LIVE";
const startedAt = new Date().toISOString();

const store = new TaskStore(path.join(DATA_DIR, "hq.json"));
await store.init();

const bus = new HqBus();
const provider = new LiveResearchProvider();
const runner = new HqRunner({
  store,
  provider,
  bus,
  mode: MODE,
});

await runner.recover();

const app = createApp({
  store,
  runner,
  bus,
  version: VERSION,
  startedAt,
  researchProvider: provider.name,
  staticDir: path.resolve(process.cwd(), "dist"),
});

const server = app.listen(PORT, () => {
  console.log(`[hq] AGENT HQ listening on http://localhost:${PORT}`);
  console.log(`[hq] mode=${MODE} data=${DATA_DIR}`);
  console.log(`[hq] research provider: ${provider.name}`);
  console.log("[hq] outbound messaging, publishing and payments: BLOCKED");
});

function shutdown(signal: string) {
  console.log(`[hq] ${signal} received; shutting down`);
  bus.closeAll();
  server.close(() => {
    void runner.stop().then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
