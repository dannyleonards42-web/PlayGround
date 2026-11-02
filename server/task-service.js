import { createHash } from 'node:crypto';
import { ExecutionError, ValidationError, toPublicError } from './lib/errors.js';
import { nowIso } from './lib/ids.js';
import { log } from './lib/log.js';
import { validateTaskSubmission } from './validation.js';

function hashResult(results) {
  return createHash('sha256').update(JSON.stringify(results)).digest('hex').slice(0, 16);
}

function titleFor(store, payload) {
  if (payload.type === 'prospect_research') {
    const { count, niche, city } = payload.input;
    return `Research ${count} ${niche} prospect${count === 1 ? '' : 's'} in ${city}`;
  }
  const source = store.getTask(payload.input.researchTaskId);
  const prospect = source?.results?.prospects?.find((entry) => entry.id === payload.input.prospectId);
  return `Draft outreach for ${prospect?.name ?? 'selected prospect'}`;
}

export function createTaskService({ store, bridge, logger = log }) {
  const queue = [];
  const idleWaiters = [];
  let active = false;

  function enqueue(taskId) {
    queue.push(taskId);
    void pump();
  }

  async function pump() {
    if (active) return;
    active = true;
    try {
      while (queue.length) {
        const taskId = queue.shift();
        await run(taskId);
      }
    } finally {
      active = false;
      if (!queue.length) {
        for (const resolve of idleWaiters.splice(0)) resolve();
      }
    }
  }

  function whenIdle() {
    if (!active && !queue.length) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  async function run(taskId) {
    const queued = store.getTask(taskId);
    if (!queued || queued.status !== 'QUEUED') return;

    store.transitionTask(taskId, 'RUNNING', {
      progress: { phase: 'STARTING', percent: 1, message: 'Execution bridge accepted the task.' }
    });
    logger.info('task.started', { taskId, type: queued.type });

    try {
      const output = await bridge.execute(store.getTask(taskId), {
        reportProgress: (phase, percent, message) => {
          const current = store.getTask(taskId);
          if (current?.status === 'RUNNING') store.setProgress(taskId, { phase, percent, message });
        }
      });

      if (!output || typeof output !== 'object') {
        throw new ExecutionError('EMPTY_RESULT', 'The execution provider returned no result.', {
          recoverable: true
        });
      }

      const requiresApproval = Boolean(output.requiresApproval);
      const results = requiresApproval ? output.data : output.data ?? output;
      if (!results || typeof results !== 'object') {
        throw new ExecutionError('EMPTY_RESULT', 'The execution provider returned an empty result.', {
          recoverable: true
        });
      }

      if (requiresApproval) {
        if (!output.approval?.id) {
          throw new ExecutionError('APPROVAL_RECORD_MISSING', 'The approval-gated task produced no approval record.', {
            recoverable: true
          });
        }
        store.addApproval(output.approval);
        store.attachResults(taskId, results);
        const persisted = store.readPersistedTask(taskId);
        if (!persisted?.results || !store.getApproval(output.approval.id)) {
          throw new ExecutionError(
            'DELIVERY_FAILED',
            'The draft could not be read back from persistent storage. Task was not marked delivered.',
            { recoverable: true }
          );
        }
        const delivery = {
          verified: true,
          method: 'Persisted JSON + approval queue + HTTP API + SSE',
          surfaces: ['state.json', 'GET /api/state', 'approval queue', 'SSE update'],
          deliveredAt: nowIso(),
          resultHash: hashResult(results)
        };
        store.awaitApproval(taskId, {
          results,
          approvalId: output.approval.id,
          delivery
        });
        const readback = store.readPersistedTask(taskId);
        if (readback?.status !== 'AWAITING_APPROVAL' || !readback.delivery?.verified) {
          throw new ExecutionError('DELIVERY_FAILED', 'Approval delivery could not be verified.', {
            recoverable: true
          });
        }
        logger.info('task.awaiting_approval', { taskId, approvalId: output.approval.id });
        return;
      }

      store.attachResults(taskId, results);
      const persisted = store.readPersistedTask(taskId);
      if (!persisted?.results) {
        throw new ExecutionError(
          'DELIVERY_FAILED',
          'Results could not be read back from persistent storage. Task was not marked complete.',
          { recoverable: true }
        );
      }

      const delivery = {
        verified: true,
        method: 'Persisted JSON + HTTP API + SSE',
        surfaces: ['state.json', 'GET /api/state', 'GET /api/tasks/:id', 'SSE update'],
        deliveredAt: nowIso(),
        resultHash: hashResult(results)
      };
      store.completeTask(taskId, delivery);
      const readback = store.readPersistedTask(taskId);
      if (readback?.status !== 'COMPLETED' || !readback.delivery?.verified) {
        throw new ExecutionError('DELIVERY_FAILED', 'Completion could not be verified after persistence.', {
          recoverable: true
        });
      }
      logger.info('task.completed', { taskId, durationMs: readback.durationMs });
    } catch (error) {
      const publicError = toPublicError(error);
      logger.error('task.failed', {
        taskId,
        code: publicError.code,
        message: publicError.message
      });
      const current = store.getTask(taskId);
      if (current?.status === 'RUNNING') {
        store.failTask(taskId, publicError);
      } else {
        logger.error('task.failure_after_terminal_state', {
          taskId,
          status: current?.status,
          code: publicError.code
        });
      }
    }
  }

  function submit(rawBody) {
    const payload = validateTaskSubmission(rawBody);
    const task = store.createTask({
      type: payload.type,
      input: payload.input,
      title: titleFor(store, payload)
    });
    enqueue(task.id);
    return task;
  }

  function retry(taskId) {
    const original = store.getTask(taskId);
    if (!original) return null;
    if (original.status !== 'FAILED') {
      throw new ValidationError('Only failed tasks can be retried.');
    }
    const task = store.createTask({
      type: original.type,
      input: original.input,
      title: `Retry: ${original.title}`,
      retryOf: original.id,
      attempts: (original.attempts ?? 1) + 1
    });
    enqueue(task.id);
    return task;
  }

  function recover() {
    const result = store.recoverInterrupted();
    for (const taskId of result.queued) enqueue(taskId);
    return result;
  }

  return { submit, retry, recover, whenIdle, run };
}
