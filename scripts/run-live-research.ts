/**
 * Submits the Phase 2 prospect-research assignment to a running AGENT HQ
 * instance, waits for the durable task to finish, and prints the evidence.
 *
 * Usage:
 *   npm run research:live -- "Galway, Ireland" cafe 3
 */
import type { ResearchResult, Task } from "../shared/types.ts";

const port = process.env.HQ_PORT ?? process.env.PORT ?? "3002";
const base = process.env.HQ_BASE_URL ?? `http://127.0.0.1:${port}`;
const city = process.argv[2] ?? "Galway, Ireland";
const category = (process.argv[3] ?? "cafe") as "cafe" | "restaurant" | "bakery";
const count = Number(process.argv[4] ?? 3);

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json()) as T;
  if (!response.ok) {
    throw new Error(`${path} failed: ${JSON.stringify(body)}`);
  }
  return body;
}

function line(): void {
  console.log("-".repeat(78));
}

const created = await json<{ task: Task }>("/api/tasks/research", {
  method: "POST",
  body: JSON.stringify({ city, category, count }),
});
console.log(`Submitted ${created.task.id} → ${created.task.status}`);
console.log(`API record: ${base}/api/tasks/${created.task.id}`);

let task = created.task;
const started = Date.now();
while (!["COMPLETED", "FAILED"].includes(task.status)) {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (Date.now() - started > 240_000) {
    throw new Error("Timed out waiting for research execution.");
  }
  const next = await json<{ task: Task }>(`/api/tasks/${created.task.id}`);
  if (next.task.status !== task.status || next.task.progress.stage !== task.progress.stage) {
    console.log(
      `${next.task.status} ${next.task.progress.percent}% [${next.task.progress.stage}] ${next.task.progress.message}`,
    );
  }
  task = next.task;
}

line();
console.log(`FINAL STATUS: ${task.status}`);
console.log(`Started:  ${task.startedAt}`);
console.log(`Finished: ${task.completedAt}`);
console.log(
  `Delivery: persisted=${task.delivery.persisted} readback=${task.delivery.readbackVerified} clients=${task.delivery.broadcastClients}`,
);
line();

if (task.status === "FAILED") {
  console.error(`ERROR ${task.error?.code}: ${task.error?.message}`);
  console.error(task.error?.detail ?? "");
  process.exitCode = 1;
} else {
  const result = task.result as ResearchResult;
  console.log(
    `ASSIGNMENT: ${result.assignment.deliveredCount}/${result.assignment.requestedCount} ${result.assignment.category} prospects in ${result.assignment.city}`,
  );
  console.log(`Provider: ${result.provider} | executed ${result.executedAt}`);
  console.log(`Candidates examined: ${result.candidatesExamined}`);
  line();
  for (const prospect of result.prospects) {
    console.log(
      `#${prospect.rank} ${prospect.businessName} — ${prospect.location.address}, ${prospect.location.city}`,
    );
    console.log(
      `    website: ${prospect.website.finalUrl ?? prospect.website.url} (${prospect.website.verification}, HTTP ${prospect.website.httpStatus ?? "n/a"})`,
    );
    console.log(
      `    opportunity: ${prospect.opportunity.score}/100 ${prospect.opportunity.level} — ${prospect.opportunity.summary}`,
    );
    console.log(`    research timestamp: ${prospect.researchTimestamp}`);
    console.log(`    facts:`);
    for (const fact of prospect.facts) {
      console.log(`      • ${fact.statement} [${fact.sourceRefs.join(", ")}]`);
    }
    console.log(`    assumptions:`);
    for (const assumption of prospect.assumptions) {
      console.log(`      ? ${assumption}`);
    }
    console.log(`    sources:`);
    for (const source of prospect.sources) {
      console.log(`      → ${source.url} (${source.kind}, ${source.retrievedAt})`);
      console.log(`        ${source.excerpt}`);
    }
    line();
  }
}
