import fs from 'node:fs';
import path from 'node:path';
import { newId, nowIso } from './lib/ids.js';
import { log } from './lib/log.js';

const TASK_LIMIT = 60;
const ACTIVITY_LIMIT = 250;
const APPROVAL_LIMIT = 100;
const EVENT_LIMIT = 40;

const ALLOWED_TRANSITIONS = {
  QUEUED: new Set(['RUNNING', 'FAILED']),
  RUNNING: new Set(['COMPLETED', 'FAILED', 'AWAITING_APPROVAL']),
  AWAITING_APPROVAL: new Set(['COMPLETED']),
  COMPLETED: new Set([]),
  FAILED: new Set([])
};

export const TASK_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AWAITING_APPROVAL'];

function baseState() {
  const createdAt = nowIso();
  return {
    schemaVersion: 2,
    revision: 0,
    createdAt,
    meta: {
      phase: '02',
      checkpoint: {
        requested: '870d509',
        found: false,
        baselineHead: '2aee5e6',
        note: 'The requested checkpoint was not present in this repository at build time.'
      },
      seeded: false,
      seededFrom: null,
      seededAt: null,
      sourceGeneratedAt: null
    },
    org: {
      name: "DEEMANNIE'S DIGITAL",
      unit: 'AGENT HQ',
      mode: 'REAL OPERATIONS'
    },
    agent: {
      id: 'nova',
      name: 'NOVA',
      callsign: 'NOVA-01',
      role: 'Research & Opportunity Lead',
      status: 'IDLE',
      currentTaskId: null,
      lastActiveAt: null,
      lastTaskId: null,
      lastTaskStatus: null,
      lastError: null,
      stats: { submitted: 0, completed: 0, failed: 0, awaiting: 0 },
      capabilities: [
        'OpenStreetMap discovery',
        'Direct homepage inspection',
        'Evidence synthesis',
        'Approval-gated outreach drafts'
      ]
    },
    tasks: [],
    approvals: [],
    activity: []
  };
}

function normalizeLoaded(state) {
  const fresh = baseState();
  return {
    ...fresh,
    ...state,
    meta: { ...fresh.meta, ...(state.meta ?? {}) },
    org: { ...fresh.org, ...(state.org ?? {}) },
    agent: {
      ...fresh.agent,
      ...(state.agent ?? {}),
      stats: { ...fresh.agent.stats, ...(state.agent?.stats ?? {}) }
    },
    tasks: Array.isArray(state.tasks) ? state.tasks.slice(0, TASK_LIMIT) : [],
    approvals: Array.isArray(state.approvals) ? state.approvals.slice(0, APPROVAL_LIMIT) : [],
    activity: Array.isArray(state.activity) ? state.activity.slice(0, ACTIVITY_LIMIT) : []
  };
}

export class Store {
  constructor({ dataDir, seedPath = null, now = nowIso } = {}) {
    if (!dataDir) throw new Error('Store requires a data directory.');
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, 'state.json');
    this.seedPath = seedPath;
    this.now = now;
    this.subscribers = new Set();
    fs.mkdirSync(dataDir, { recursive: true });
    this.state = this.#load();
  }

  #load() {
    if (fs.existsSync(this.statePath)) {
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return normalizeLoaded(parsed);
    }
    if (this.seedPath && fs.existsSync(this.seedPath)) {
      const seed = normalizeLoaded(JSON.parse(fs.readFileSync(this.seedPath, 'utf8')));
      seed.meta.seeded = true;
      seed.meta.seededFrom = path.basename(this.seedPath);
      seed.meta.seededAt = nowIso();
      seed.meta.sourceGeneratedAt = seed.meta.sourceGeneratedAt ?? seed.tasks?.[0]?.completedAt ?? null;
      seed.revision = 0;
      seed.agent.status = 'IDLE';
      seed.agent.currentTaskId = null;
      for (const task of seed.tasks) {
        if (task.status === 'RUNNING' || task.status === 'QUEUED') {
          task.status = 'FAILED';
          task.error = {
            code: 'INTERRUPTED',
            message: 'Archived task was not running when the archive was restored.',
            recoverable: true
          };
        }
      }
      log.info('state.seeded', { tasks: seed.tasks.length, sourceGeneratedAt: seed.meta.sourceGeneratedAt });
      return seed;
    }
    return baseState();
  }

  #save(reason, taskId = null) {
    this.state.revision += 1;
    const temp = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.statePath);
    this.#emit(reason, taskId);
  }

  #emit(reason, taskId) {
    const payload = { reason, taskId, revision: this.state.revision, at: nowIso() };
    for (const subscriber of this.subscribers) {
      try {
        subscriber(payload);
      } catch (error) {
        log.warn('state.subscriber_failed', { message: error.message });
      }
    }
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  getTask(id) {
    return this.state.tasks.find((task) => task.id === id) ?? null;
  }

  readPersistedTask(id) {
    if (!fs.existsSync(this.statePath)) return null;
    const persisted = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    return persisted.tasks?.find((task) => task.id === id) ?? null;
  }

  #activity(type, message, extra = {}) {
    this.state.activity.unshift({
      id: newId('act'),
      at: nowIso(),
      type,
      level: extra.level ?? 'info',
      message,
      ...extra
    });
    this.state.activity = this.state.activity.slice(0, ACTIVITY_LIMIT);
  }

  #taskEvent(task, status, message, extra = {}) {
    task.events ??= [];
    task.events.push({
      at: nowIso(),
      status,
      message,
      ...extra
    });
    task.events = task.events.slice(-EVENT_LIMIT);
  }

  createTask({ type, input, title, retryOf = null, attempts = 1 }) {
    const at = nowIso();
    const task = {
      id: newId('tsk'),
      type,
      input,
      title,
      status: 'QUEUED',
      createdAt: at,
      updatedAt: at,
      queuedAt: at,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      attempts,
      retryOf,
      progress: { phase: 'QUEUED', percent: 0, message: 'Waiting for the execution bridge.' },
      events: [],
      results: null,
      error: null,
      delivery: null,
      approvalId: null,
      approvalDecision: null
    };
    this.#taskEvent(task, 'QUEUED', 'Task accepted and queued for the execution bridge.');
    this.state.tasks.unshift(task);
    this.state.tasks = this.state.tasks.slice(0, TASK_LIMIT);
    this.state.agent.stats.submitted += 1;
    this.#activity('TASK_QUEUED', `${title} queued.`, { taskId: task.id, type });
    this.#save('task.queued', task.id);
    return structuredClone(task);
  }

  transitionTask(id, nextStatus, patch = {}) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!ALLOWED_TRANSITIONS[task.status]?.has(nextStatus)) {
      throw new Error(`Invalid task transition ${task.status} → ${nextStatus}`);
    }
    task.status = nextStatus;
    task.updatedAt = nowIso();
    Object.assign(task, patch);

    if (nextStatus === 'RUNNING') {
      task.startedAt ??= nowIso();
      task.progress = patch.progress ?? { phase: 'RUNNING', percent: 1, message: 'Execution started.' };
      this.state.agent.status = 'RUNNING';
      this.state.agent.currentTaskId = task.id;
      this.state.agent.lastActiveAt = task.startedAt;
      this.state.agent.lastTaskId = task.id;
      this.state.agent.lastTaskStatus = 'RUNNING';
      this.#taskEvent(task, 'RUNNING', task.progress.message, { phase: task.progress.phase });
      this.#activity('TASK_RUNNING', `${task.title} started.`, { taskId: task.id });
    }

    this.#save(`task.${nextStatus.toLowerCase()}`, task.id);
    return structuredClone(task);
  }

  setProgress(id, { phase, percent, message }) {
    const task = this.getTask(id);
    if (!task || task.status !== 'RUNNING') return;
    const previousPhase = task.progress?.phase;
    task.progress = {
      phase,
      percent: Math.max(task.progress?.percent ?? 0, Math.min(99, Math.round(percent))),
      message
    };
    task.updatedAt = nowIso();
    if (phase !== previousPhase) {
      this.#taskEvent(task, 'RUNNING', message, { phase });
    }
    this.state.agent.lastActiveAt = task.updatedAt;
    this.#save('task.progress', task.id);
  }

  attachResults(id, results) {
    const task = this.getTask(id);
    if (!task || task.status !== 'RUNNING') throw new Error('Results can only attach to a running task.');
    task.results = results;
    task.updatedAt = nowIso();
    this.#save('task.results', task.id);
    return structuredClone(task);
  }

  completeTask(id, delivery) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (task.status !== 'RUNNING') throw new Error('Only a running task can complete.');
    if (!task.results) throw new Error('A task cannot complete without results.');
    task.status = 'COMPLETED';
    task.completedAt = nowIso();
    task.durationMs = new Date(task.completedAt) - new Date(task.startedAt);
    task.updatedAt = task.completedAt;
    task.delivery = delivery;
    task.progress = { phase: 'COMPLETED', percent: 100, message: 'Results persisted and delivered.' };
    this.state.agent.status = 'IDLE';
    this.state.agent.currentTaskId = null;
    this.state.agent.lastActiveAt = task.completedAt;
    this.state.agent.lastTaskStatus = 'COMPLETED';
    this.state.agent.lastError = null;
    this.state.agent.stats.completed += 1;
    this.#taskEvent(task, 'COMPLETED', 'Results persisted and delivered to the AGENT HQ interface.', {
      delivery: delivery.method
    });
    const prospectCount = task.results.prospects?.length;
    this.#activity(
      'TASK_COMPLETED',
      prospectCount
        ? `${task.title} completed with ${prospectCount} evidence-backed prospect(s).`
        : `${task.title} completed.`,
      { taskId: task.id }
    );
    this.#save('task.completed', task.id);
    return structuredClone(task);
  }

  awaitApproval(id, { results, approvalId, delivery }) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (task.status !== 'RUNNING') throw new Error('Only a running task can await approval.');
    task.status = 'AWAITING_APPROVAL';
    task.results = results;
    task.approvalId = approvalId;
    task.completedAt = null;
    task.updatedAt = nowIso();
    task.durationMs = new Date(task.updatedAt) - new Date(task.startedAt);
    task.delivery = delivery;
    task.progress = {
      phase: 'AWAITING_APPROVAL',
      percent: 100,
      message: 'Draft delivered. Human approval required; nothing was sent.'
    };
    this.state.agent.status = 'IDLE';
    this.state.agent.currentTaskId = null;
    this.state.agent.lastActiveAt = task.updatedAt;
    this.state.agent.lastTaskStatus = 'AWAITING_APPROVAL';
    this.state.agent.stats.awaiting += 1;
    this.#taskEvent(task, 'AWAITING_APPROVAL', 'Outreach draft delivered to the approval queue. Nothing was sent.');
    this.#activity('TASK_AWAITING_APPROVAL', `${task.title} is awaiting human approval.`, { taskId: task.id });
    this.#save('task.awaiting_approval', task.id);
    return structuredClone(task);
  }

  failTask(id, error) {
    const task = this.getTask(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    if (!ALLOWED_TRANSITIONS[task.status]?.has('FAILED')) {
      throw new Error(`Task ${task.status} cannot fail.`);
    }
    task.status = 'FAILED';
    task.completedAt = nowIso();
    task.updatedAt = task.completedAt;
    task.durationMs = task.startedAt ? new Date(task.completedAt) - new Date(task.startedAt) : 0;
    task.error = error;
    task.progress = { phase: 'FAILED', percent: 0, message: error.message };
    this.state.agent.status = 'IDLE';
    this.state.agent.currentTaskId = null;
    this.state.agent.lastActiveAt = task.completedAt;
    this.state.agent.lastTaskStatus = 'FAILED';
    this.state.agent.lastError = { code: error.code, message: error.message, at: task.completedAt };
    this.state.agent.stats.failed += 1;
    this.#taskEvent(task, 'FAILED', error.message, { code: error.code });
    this.#activity('TASK_FAILED', `${task.title} failed: ${error.message}`, {
      taskId: task.id,
      level: 'error'
    });
    this.#save('task.failed', task.id);
    return structuredClone(task);
  }

  addApproval(approval) {
    this.state.approvals.unshift(approval);
    this.state.approvals = this.state.approvals.slice(0, APPROVAL_LIMIT);
    this.#activity('APPROVAL_CREATED', `Outreach draft for ${approval.prospectName} awaits approval.`, {
      taskId: approval.taskId,
      approvalId: approval.id
    });
    this.#save('approval.created', approval.taskId);
    return structuredClone(approval);
  }

  getApproval(id) {
    return this.state.approvals.find((approval) => approval.id === id) ?? null;
  }

  decideApproval(id, { decision, note }) {
    const approval = this.getApproval(id);
    if (!approval) return null;
    if (approval.status !== 'AWAITING_APPROVAL') {
      throw new Error('This approval has already been decided.');
    }
    const at = nowIso();
    approval.status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    approval.decision = { at, decision, note: note || null, by: 'HQ operator' };
    approval.sendStatus = 'NOT_SENT';
    const task = this.getTask(approval.taskId);
    if (task) {
      task.approvalDecision = approval.decision;
      task.updatedAt = at;
      if (task.status === 'AWAITING_APPROVAL') {
        task.status = 'COMPLETED';
        task.completedAt = at;
        task.durationMs = task.startedAt ? new Date(at) - new Date(task.startedAt) : task.durationMs;
        task.progress = {
          phase: 'COMPLETED',
          percent: 100,
          message:
            decision === 'approve'
              ? 'Approval recorded. Draft released for manual use; nothing was sent.'
              : 'Approval rejected. Draft closed; nothing was sent.'
        };
        this.state.agent.lastTaskStatus = 'COMPLETED';
        this.state.agent.lastActiveAt = at;
        this.state.agent.stats.completed += 1;
        this.state.agent.stats.awaiting = Math.max(0, this.state.agent.stats.awaiting - 1);
        this.#activity(
          'TASK_APPROVAL_RESOLVED',
          decision === 'approve'
            ? `${task.title} closed. Draft approved for manual use; nothing was sent.`
            : `${task.title} closed. Draft rejected; nothing was sent.`,
          { taskId: task.id, approvalId: id }
        );
      }
      this.#taskEvent(
        task,
        'COMPLETED',
        decision === 'approve'
          ? 'Draft approved for manual use. AGENT HQ did not send it.'
          : 'Draft rejected. Nothing was sent.'
      );
    }
    this.#activity(
      'APPROVAL_DECIDED',
      decision === 'approve'
        ? `Draft for ${approval.prospectName} approved for manual use. No message sent.`
        : `Draft for ${approval.prospectName} rejected. No message sent.`,
      { approvalId: id, taskId: approval.taskId, level: decision === 'approve' ? 'info' : 'warn' }
    );
    this.#save('approval.decided', approval.taskId);
    return structuredClone(approval);
  }

  recoverInterrupted() {
    const interrupted = this.state.tasks.filter((task) => task.status === 'RUNNING');
    for (const task of interrupted) {
      task.error = {
        code: 'INTERRUPTED',
        message: 'Execution was interrupted by a server restart. Retry to run it again.',
        recoverable: true
      };
      task.status = 'FAILED';
      task.completedAt = nowIso();
      task.updatedAt = task.completedAt;
      task.progress = { phase: 'FAILED', percent: 0, message: task.error.message };
      this.#taskEvent(task, 'FAILED', task.error.message, { code: 'INTERRUPTED' });
      this.state.agent.stats.failed += 1;
    }
    const queued = this.state.tasks.filter((task) => task.status === 'QUEUED').map((task) => task.id);
    this.state.agent.status = 'IDLE';
    this.state.agent.currentTaskId = null;
    if (interrupted.length) {
      this.#activity('TASK_INTERRUPTED', `${interrupted.length} interrupted task(s) marked failed and recoverable.`, {
        level: 'warn'
      });
      this.#save('recovery.interrupted');
    }
    return { interrupted: interrupted.map((task) => task.id), queued };
  }

  metrics() {
    const tasks = this.state.tasks;
    const completed = tasks.filter((task) => task.status === 'COMPLETED');
    const failed = tasks.filter((task) => task.status === 'FAILED');
    const research = completed.filter((task) => task.type === 'prospect_research');
    const prospects = research.flatMap((task) => task.results?.prospects ?? []);
    const facts = prospects.reduce((total, prospect) => total + (prospect.facts?.length ?? 0), 0);
    const assumptions = prospects.reduce((total, prospect) => total + (prospect.assumptions?.length ?? 0), 0);
    const durations = completed.map((task) => task.durationMs).filter((value) => Number.isFinite(value));
    return {
      totalTasks: tasks.length,
      completed: completed.length,
      failed: failed.length,
      running: tasks.filter((task) => task.status === 'RUNNING').length,
      queued: tasks.filter((task) => task.status === 'QUEUED').length,
      awaitingApproval: tasks.filter((task) => task.status === 'AWAITING_APPROVAL').length,
      researchRuns: research.length,
      prospects: prospects.length,
      verifiedProspects: prospects.filter((prospect) => prospect.verification?.status === 'VERIFIED').length,
      facts,
      assumptions,
      successRate:
        completed.length + failed.length === 0
          ? null
          : Math.round((completed.length / (completed.length + failed.length)) * 100),
      averageDurationMs: durations.length
        ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length)
        : null,
      lastCompletedAt: completed[0]?.completedAt ?? null,
      pendingApprovals: this.state.approvals.filter((approval) => approval.status === 'AWAITING_APPROVAL').length
    };
  }

  publicSnapshot() {
    const state = this.snapshot();
    const latestResearch = state.tasks.find(
      (task) => task.type === 'prospect_research' && task.status === 'COMPLETED' && task.results?.prospects?.length
    );
    return {
      schemaVersion: state.schemaVersion,
      revision: state.revision,
      generatedAt: nowIso(),
      phase: state.meta.phase,
      org: state.org,
      meta: state.meta,
      agent: state.agent,
      metrics: this.metrics(),
      tasks: state.tasks,
      approvals: state.approvals,
      activity: state.activity.slice(0, 40),
      latestResearchTaskId: latestResearch?.id ?? null,
      statuses: TASK_STATUSES,
      services: {
        bridge: { status: 'READY', label: 'Execution bridge' },
        discovery: { status: 'READY', label: 'OpenStreetMap / Nominatim' },
        inspection: { status: 'READY', label: 'Direct HTTP homepage audit' },
        delivery: { status: 'READY', label: 'Persisted JSON + HTTP API + SSE' },
        outbound: { status: 'LOCKED', label: 'Email / publishing / spending' }
      }
    };
  }
}
