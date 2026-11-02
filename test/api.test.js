import test from 'node:test';
import assert from 'node:assert/strict';
import { json, sampleCandidates, samplePage, startTestApp, waitForTask, waitFor } from './helpers.js';

function candidatePages() {
  return new Map(
    sampleCandidates(4).map((candidate) => [
      candidate.websiteUrl,
      samplePage({
        name: candidate.name,
        website: candidate.websiteUrl,
        body: `<!doctype html><html><head><title>${candidate.name} | Portland</title></head><body>
          <h1>${candidate.name}</h1><p>Fresh bread in Portland, Oregon.</p>
          <p>Copyright 2026</p>
        </body></html>`
      })
    ])
  );
}

test('POST /api/tasks creates a real task and delivered results are readable through the API', async (t) => {
  const pages = candidatePages();
  const { base } = await startTestApp(t, { fetchPage: async (url) => pages.get(url) });

  const submitted = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type: 'prospect_research',
      input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 }
    })
  });
  assert.equal(submitted.response.status, 202);
  assert.equal(submitted.body.task.status, 'QUEUED');

  const task = await waitForTask(base, submitted.body.task.id, ['COMPLETED', 'FAILED']);
  assert.equal(task.status, 'COMPLETED');
  assert.equal(task.delivery.verified, true);
  assert.ok(task.delivery.surfaces.includes('GET /api/state'));
  assert.equal(task.results.prospects.length, 3);
  assert.ok(task.results.prospects.every((prospect) => prospect.facts.length > 0));

  const state = await json(base, '/api/state');
  assert.equal(state.response.status, 200);
  assert.equal(state.body.latestResearchTaskId, task.id);
  assert.equal(state.body.metrics.prospects, 3);
  assert.equal(state.body.agent.status, 'IDLE');
  assert.ok(state.body.activity.some((entry) => entry.type === 'TASK_COMPLETED'));

  const persisted = await json(base, `/api/tasks/${task.id}`);
  assert.equal(persisted.body.task.delivery.resultHash, task.delivery.resultHash);

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /AGENT HQ/);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
});

test('invalid submissions return 400 and do not create a task', async (t) => {
  const { base, app } = await startTestApp(t);
  const before = app.store.snapshot().tasks.length;

  const bad = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ type: 'prospect_research', input: { niche: 'x', city: '', count: 99 } })
  });
  assert.equal(bad.response.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_FAILED');
  assert.equal(app.store.snapshot().tasks.length, before);

  const unknown = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ type: 'drop_tables', input: {} })
  });
  assert.equal(unknown.response.status, 400);
});

test('outreach drafts stop at AWAITING_APPROVAL and approval never sends', async (t) => {
  const pages = candidatePages();
  const { base } = await startTestApp(t, { fetchPage: async (url) => pages.get(url) });
  const submitted = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ type: 'prospect_research', input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 } })
  });
  const research = await waitForTask(base, submitted.body.task.id, ['COMPLETED', 'FAILED']);
  assert.equal(research.status, 'COMPLETED');

  const prospect = research.results.prospects[0];
  const draftSubmission = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      type: 'outreach_draft',
      input: { researchTaskId: research.id, prospectId: prospect.id }
    })
  });
  assert.equal(draftSubmission.response.status, 202);

  const draftTask = await waitForTask(base, draftSubmission.body.task.id, ['AWAITING_APPROVAL', 'FAILED']);
  assert.equal(draftTask.status, 'AWAITING_APPROVAL');
  assert.equal(draftTask.delivery.verified, true);
  assert.equal(draftTask.results.sendStatus, 'NOT_SENT');
  assert.ok(draftTask.approvalId);

  const approval = await waitFor(
    async () => {
      const { body } = await json(base, '/api/approvals');
      return body.approvals.find((entry) => entry.id === draftTask.approvalId) ?? null;
    },
    { label: 'approval record' }
  );
  assert.equal(approval.status, 'AWAITING_APPROVAL');
  assert.equal(approval.sendStatus, 'NOT_SENT');
  assert.match(approval.notice, /no message is sent/i);

  const decision = await json(base, `/api/approvals/${approval.id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'approve' })
  });
  assert.equal(decision.response.status, 200);
  assert.equal(decision.body.approval.status, 'APPROVED');
  assert.equal(decision.body.approval.sendStatus, 'NOT_SENT');

  const again = await json(base, `/api/approvals/${approval.id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'reject' })
  });
  assert.equal(again.response.status, 409);

  const state = await json(base, '/api/state');
  const storedTask = state.body.tasks.find((task) => task.id === draftTask.id);
  assert.equal(storedTask.status, 'COMPLETED');
  assert.equal(storedTask.approvalDecision.decision, 'approve');
  assert.equal(storedTask.delivery.verified, true);
  assert.ok(storedTask.completedAt);
  assert.equal(storedTask.progress.phase, 'COMPLETED');
  assert.equal(state.body.agent.stats.awaiting, 0);
  assert.equal(state.body.metrics.pendingApprovals, 0);
});

test('a provider failure is visible through the API and retry remains available', async (t) => {
  const bridge = {
    list: () => [{ id: 'failing', name: 'Failing fixture' }],
    async execute() {
      const error = new Error('Discovery service is unavailable.');
      error.code = 'DISCOVERY_UNAVAILABLE';
      error.recoverable = true;
      throw error;
    }
  };
  const { base } = await startTestApp(t, { bridge });

  const submitted = await json(base, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ type: 'prospect_research', input: { niche: 'bakery', city: 'Portland', count: 3 } })
  });
  const failed = await waitForTask(base, submitted.body.task.id, ['FAILED', 'COMPLETED']);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.error.code, 'INTERNAL_ERROR');
  assert.match(failed.error.message, /unexpected error/i);
  assert.equal(failed.delivery, null);

  const retried = await json(base, `/api/tasks/${failed.id}/retry`, { method: 'POST', body: '{}' });
  assert.equal(retried.response.status, 202);
  assert.notEqual(retried.body.task.id, failed.id);
  assert.equal(retried.body.task.retryOf, failed.id);
  const retriedResult = await waitForTask(base, retried.body.task.id, ['FAILED', 'COMPLETED']);
  assert.equal(retriedResult.status, 'FAILED');
});

test('task lookup and approval routes return clean 404s', async (t) => {
  const { base } = await startTestApp(t);
  const missing = await json(base, '/api/tasks/tsk_000000000000');
  assert.equal(missing.response.status, 404);
  assert.equal(missing.body.error.code, 'TASK_NOT_FOUND');

  const approval = await json(base, '/api/approvals/apr_000000000000/decision', {
    method: 'POST',
    body: JSON.stringify({ decision: 'approve' })
  });
  assert.equal(approval.response.status, 404);
});
