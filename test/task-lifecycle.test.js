import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { Store } from '../server/store.js';
import { createTaskService } from '../server/task-service.js';
import { ValidationError } from '../server/lib/errors.js';
import { tempDir } from './helpers.js';

function setup(t, execute) {
  const dataDir = tempDir(t);
  const store = new Store({ dataDir });
  const bridge = {
    list: () => [{ id: 'fixture', name: 'Fixture provider' }],
    execute
  };
  const service = createTaskService({ store, bridge, logger: { info() {}, warn() {}, error() {}, debug() {} } });
  return { store, service, dataDir };
}

test('submission validates input and refuses unknown task types', async (t) => {
  const { store, service } = setup(t, async () => ({ prospects: [] }));

  assert.throws(
    () => service.submit({ type: 'prospect_research', input: { niche: 'b', city: 'Portland', count: 3 } }),
    ValidationError
  );
  assert.throws(
    () => service.submit({ type: 'prospect_research', input: { niche: 'bakery', city: '', count: 3 } }),
    ValidationError
  );
  assert.throws(
    () => service.submit({ type: 'prospect_research', input: { niche: 'bakery', city: 'Portland', count: 9 } }),
    ValidationError
  );
  assert.throws(() => service.submit({ type: 'unknown_task', input: {} }), ValidationError);
  assert.equal(store.snapshot().tasks.length, 0);
});

test('a submitted task transitions QUEUED → RUNNING → COMPLETED with verified delivery', async (t) => {
  const { store, service } = setup(t, async (task, context) => {
    context.reportProgress('DISCOVERING', 20, 'Searching fixtures.');
    context.reportProgress('SYNTHESIZING', 80, 'Writing results.');
    return {
      assignment: { niche: task.input.niche, city: task.input.city },
      prospects: [{ id: 'prospect_p1', name: 'Alpha Bakery', facts: [], assumptions: [] }]
    };
  });

  const submitted = service.submit({
    type: 'prospect_research',
    input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 }
  });
  assert.equal(submitted.status, 'QUEUED');
  await service.whenIdle();

  const task = store.getTask(submitted.id);
  assert.equal(task.status, 'COMPLETED');
  assert.ok(task.startedAt);
  assert.ok(task.completedAt);
  assert.ok(task.durationMs >= 0);
  assert.equal(task.delivery.verified, true);
  assert.equal(task.delivery.resultHash.length, 16);
  assert.ok(task.delivery.surfaces.includes('GET /api/state'));
  assert.equal(task.results.prospects.length, 1);
  assert.deepEqual(
    [...new Set(task.events.map((event) => event.status))],
    ['QUEUED', 'RUNNING', 'COMPLETED']
  );

  const persisted = store.readPersistedTask(submitted.id);
  assert.equal(persisted.status, 'COMPLETED');
  assert.equal(persisted.delivery.verified, true);
  assert.deepEqual(persisted.results, task.results);
});

test('provider failures become FAILED with a useful, recoverable error and no COMPLETED claim', async (t) => {
  const { store, service } = setup(t, async () => {
    const error = new Error('Fixture provider is offline.');
    error.code = 'PROVIDER_OFFLINE';
    error.recoverable = true;
    throw error;
  });

  const submitted = service.submit({
    type: 'prospect_research',
    input: { niche: 'bakery', city: 'Portland, Oregon', count: 3 }
  });
  await service.whenIdle();

  const task = store.getTask(submitted.id);
  assert.equal(task.status, 'FAILED');
  assert.equal(task.error.code, 'INTERNAL_ERROR');
  assert.match(task.error.message, /unexpected error/i);
  assert.equal(task.delivery, null);
  assert.equal(task.results, null);
  assert.match(task.progress.message, /unexpected error/i);
  assert.ok(task.events.some((event) => event.status === 'FAILED'));

  const retry = service.retry(submitted.id);
  assert.notEqual(retry.id, submitted.id);
  assert.equal(retry.retryOf, submitted.id);
  assert.equal(retry.attempts, 2);
  await service.whenIdle();
  assert.equal(store.getTask(retry.id).status, 'FAILED');
});

test('retry produces a new task record and can succeed', async (t) => {
  let calls = 0;
  const { store, service } = setup(t, async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('First attempt failed.');
      error.code = 'TRANSIENT';
      error.recoverable = true;
      throw error;
    }
    return { prospects: [{ id: 'prospect_p1', name: 'Recovered Bakery', facts: [], assumptions: [] }] };
  });

  const first = service.submit({ type: 'prospect_research', input: { niche: 'bakery', city: 'Portland', count: 3 } });
  await service.whenIdle();
  assert.equal(store.getTask(first.id).status, 'FAILED');

  const second = service.retry(first.id);
  await service.whenIdle();
  const retried = store.getTask(second.id);
  assert.equal(retried.status, 'COMPLETED');
  assert.equal(retried.retryOf, first.id);
  assert.equal(retried.attempts, 2);
  assert.equal(retried.delivery.verified, true);
});

test('tasks execute sequentially and queued work is visible before it starts', async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const { store, service } = setup(t, async (task) => {
    if (task.input.city === 'First') await gate;
    return { prospects: [{ id: `p_${task.input.city}`, name: task.input.city, facts: [], assumptions: [] }] };
  });

  const first = service.submit({ type: 'prospect_research', input: { niche: 'bakery', city: 'First', count: 1 } });
  const second = service.submit({ type: 'prospect_research', input: { niche: 'bakery', city: 'Second', count: 1 } });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(store.getTask(first.id).status, 'RUNNING');
  assert.equal(store.getTask(second.id).status, 'QUEUED');
  release();
  await service.whenIdle();
  assert.equal(store.getTask(first.id).status, 'COMPLETED');
  assert.equal(store.getTask(second.id).status, 'COMPLETED');
});

test('recovery marks an interrupted RUNNING task FAILED and keeps it retryable', async (t) => {
  const dataDir = tempDir(t);
  const firstStore = new Store({ dataDir });
  const task = firstStore.createTask({
    type: 'prospect_research',
    input: { niche: 'bakery', city: 'Portland', count: 3 },
    title: 'Interrupted research'
  });
  firstStore.transitionTask(task.id, 'RUNNING', {
    progress: { phase: 'DISCOVERING', percent: 20, message: 'Searching.' }
  });

  const reloaded = new Store({ dataDir });
  const service = createTaskService({
    store: reloaded,
    bridge: { list: () => [], execute: async () => ({ prospects: [] }) },
    logger: { info() {}, warn() {}, error() {}, debug() {} }
  });
  const result = service.recover();
  assert.deepEqual(result.interrupted, [task.id]);
  const recovered = reloaded.getTask(task.id);
  assert.equal(recovered.status, 'FAILED');
  assert.equal(recovered.error.code, 'INTERRUPTED');
  assert.equal(recovered.error.recoverable, true);

  const retry = service.retry(task.id);
  assert.equal(retry.retryOf, task.id);
  await service.whenIdle();
  assert.equal(reloaded.getTask(retry.id).type, 'prospect_research');
});

test('store persists atomically and rejects invalid task transitions', (t) => {
  const dataDir = tempDir(t);
  const store = new Store({ dataDir });
  const task = store.createTask({
    type: 'prospect_research',
    input: { niche: 'bakery', city: 'Portland', count: 1 },
    title: 'Transition test'
  });
  assert.throws(() => store.transitionTask(task.id, 'COMPLETED'), /Invalid task transition/);
  assert.throws(() => store.completeTask(task.id), /running task/);
  assert.ok(existsSync(path.join(dataDir, 'state.json')));
});

test('a rejected draft closes as COMPLETED with the decision recorded and nothing sent', (t) => {
  const dataDir = tempDir(t);
  const store = new Store({ dataDir });
  const task = store.createTask({
    type: 'outreach_draft',
    input: { researchTaskId: 'tsk_000000000000', prospectId: 'prospect_p1' },
    title: 'Draft outreach for Test Bakery'
  });
  store.transitionTask(task.id, 'RUNNING', {
    progress: { phase: 'STARTING', percent: 1, message: 'Drafting.' }
  });
  store.attachResults(task.id, { draft: { subject: 'Hello' }, sendStatus: 'NOT_SENT' });
  store.addApproval({
    id: 'apr_000000000001',
    taskId: task.id,
    prospectId: 'prospect_p1',
    prospectName: 'Test Bakery',
    subject: 'Hello',
    status: 'AWAITING_APPROVAL',
    sendStatus: 'NOT_SENT'
  });
  store.awaitApproval(task.id, {
    results: { draft: { subject: 'Hello' }, sendStatus: 'NOT_SENT' },
    approvalId: 'apr_000000000001',
    delivery: { verified: true, method: 'test', deliveredAt: new Date().toISOString(), resultHash: 'abc' }
  });

  const decision = store.decideApproval('apr_000000000001', { decision: 'reject' });
  assert.equal(decision.status, 'REJECTED');
  assert.equal(decision.sendStatus, 'NOT_SENT');

  const closed = store.getTask(task.id);
  assert.equal(closed.status, 'COMPLETED');
  assert.equal(closed.approvalDecision.decision, 'reject');
  assert.equal(closed.delivery.verified, true);
  assert.ok(closed.completedAt);
  assert.equal(closed.progress.phase, 'COMPLETED');
  assert.equal(store.snapshot().agent.stats.awaiting, 0);
  assert.equal(store.snapshot().metrics.pendingApprovals, 0);
});
