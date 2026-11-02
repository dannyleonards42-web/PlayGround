const $ = (selector) => document.querySelector(selector);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const ui = {
  state: null,
  currentView: 'overview',
  activeTaskId: null,
  pendingApprovalProspect: null,
  refreshing: false,
  refreshQueued: false,
  searchProspects: '',
  searchEvidence: '',
  sse: null,
  bridgeOnline: false
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'onclick') node.addEventListener('click', value);
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value);
  }
  const append = (child) => {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) child.forEach(append);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  };
  children.forEach(append);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

function safeHref(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function timeText(iso, mode = 'relative') {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  if (mode === 'relative') return relativeTime(date);
  if (mode === 'short') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;
  }
  if (mode === 'date') {
    return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} · ${String(
    date.getUTCHours()
  ).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(
    2,
    '0'
  )} UTC`;
}

function relativeTime(date) {
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
  return timeText(date.toISOString(), 'date');
}

function timeNode(iso, mode = 'relative') {
  return el('time', { datetime: iso ?? '', text: timeText(iso, mode), dataset: { ts: iso ?? '', mode } });
}

function refreshRelativeTimes() {
  document.querySelectorAll('time[data-ts]').forEach((node) => {
    node.textContent = timeText(node.dataset.ts, node.dataset.mode || 'relative');
  });
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function statusPill(status, extraClass = '') {
  const normalized = String(status ?? 'IDLE').toLowerCase();
  return el('span', {
    class: `status-pill status-${normalized} ${extraClass}`.trim(),
    text: String(status ?? 'IDLE').replace(/_/g, ' '),
    title: `Task state: ${String(status ?? 'IDLE').replace(/_/g, ' ')}`
  });
}

function priorityChip(priority) {
  const value = String(priority ?? 'REVIEW').toUpperCase();
  return el('span', { class: `priority priority-${value.toLowerCase()}`, text: value });
}

function verificationChip(prospect) {
  const status = prospect.verification?.status ?? 'UNVERIFIED';
  const label = status === 'SOURCE_ONLY' ? 'SOURCE ONLY' : status;
  const klass = status === 'VERIFIED' ? 'verified' : status === 'SOURCE_ONLY' ? 'source_only' : 'partial';
  return el('span', {
    class: `status-pill status-${klass}`,
    text: label,
    title: prospect.verification?.label ?? ''
  });
}

function safeCount(value) {
  return Number.isFinite(value) ? value : 0;
}

function toast(message, kind = 'info') {
  const region = $('#toast-region');
  const node = el('div', { class: 'toast', dataset: { kind }, role: 'status' }, message);
  region.appendChild(node);
  setTimeout(() => node.remove(), 6000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    ...options
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `Request failed with HTTP ${response.status}.`);
    error.code = payload?.error?.code;
    error.recoverable = payload?.error?.recoverable;
    error.status = response.status;
    throw error;
  }
  return payload;
}

function switchView(view) {
  const allowed = ['overview', 'prospects', 'tasks', 'approvals', 'evidence'];
  const next = allowed.includes(view) ? view : 'overview';
  ui.currentView = next;
  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    const active = panel.dataset.viewPanel === next;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === next);
  });
  history.replaceState(null, '', `#${next}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setBridge(online, label) {
  ui.bridgeOnline = online;
  const dot = $('#bridge-state .dot');
  dot.classList.toggle('is-online', online);
  dot.classList.toggle('is-offline', !online);
  $('#bridge-label').textContent = label;
}

/* ---------- data refresh ---------- */

async function refreshState() {
  if (ui.refreshing) {
    ui.refreshQueued = true;
    return;
  }
  ui.refreshing = true;
  try {
    const state = await api('/api/state');
    ui.state = state;
    renderAll();
    if (!ui.activeTaskId) {
      const running = state.tasks.find((task) => task.status === 'RUNNING' || task.status === 'QUEUED');
      if (running) ui.activeTaskId = running.id;
    }
    if (ui.pendingApprovalProspect) {
      const approval = state.approvals.find(
        (entry) => entry.prospectId === ui.pendingApprovalProspect && entry.status === 'AWAITING_APPROVAL'
      );
      if (approval) {
        ui.pendingApprovalProspect = null;
        switchView('approvals');
        toast('Draft delivered to the approval queue. Nothing was sent.', 'warn');
      }
    }
  } catch (error) {
    setBridge(false, 'BRIDGE OFFLINE');
    toast(`Could not load AGENT HQ state: ${error.message}`, 'error');
  } finally {
    ui.refreshing = false;
    if (ui.refreshQueued) {
      ui.refreshQueued = false;
      void refreshState();
    }
  }
}

let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshState(), 180);
}

function connectEvents() {
  if (ui.sse) ui.sse.close();
  const source = new EventSource('/api/events');
  ui.sse = source;
  source.addEventListener('ready', () => {
    setBridge(true, 'BRIDGE ONLINE');
  });
  source.addEventListener('update', (event) => {
    setBridge(true, 'BRIDGE ONLINE');
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = null;
    }
    if (payload?.reason === 'task.completed') {
      toast('Task completed. Results are persisted and readable through the API.', 'info');
    }
    if (payload?.reason === 'task.failed') {
      toast('Task failed. The error is visible on the task record.', 'error');
    }
    scheduleRefresh();
  });
  source.onerror = () => {
    setBridge(false, 'RECONNECTING');
  };
}

async function refreshHealth() {
  try {
    const health = await api('/api/health');
    setBridge(true, 'BRIDGE ONLINE');
    if (health.outbound !== 'LOCKED — no email, publishing or spending') {
      setBridge(false, 'OUTBOUND NOT LOCKED');
    }
  } catch {
    setBridge(false, 'BRIDGE OFFLINE');
  }
}

/* ---------- rendering ---------- */

function renderAll() {
  if (!ui.state) return;
  renderCheckpoint();
  renderAgent();
  renderMetrics();
  renderLive();
  renderLatestResults();
  renderProspects();
  renderTasks();
  renderApprovals();
  renderEvidence();
  renderActivity();
  renderNavCounts();
}

function renderCheckpoint() {
  const checkpoint = ui.state.meta?.checkpoint;
  if (!checkpoint) return;
  const status = $('#checkpoint-status');
  const note = $('#checkpoint-note');
  if (checkpoint.found) {
    status.textContent = 'PRESERVED';
    status.className = 'status-pill status-completed';
    note.textContent = `Checkpoint ${checkpoint.requested} is present. Existing work remains untouched.`;
  } else {
    status.textContent = 'NOT FOUND';
    status.className = 'status-pill status-failed';
    note.textContent = `No object “${checkpoint.requested}” exists in this repository. Baseline HEAD ${checkpoint.baselineHead} is preserved; this build adds new files.`;
  }
}

function renderAgent() {
  const agent = ui.state.agent;
  $('#agent-status').textContent = agent.status;
  $('#agent-status').className = `status-pill status-${String(agent.status).toLowerCase()}`;
  $('#agent-last-active').textContent = agent.lastActiveAt ? timeText(agent.lastActiveAt) : 'No runs yet';
  $('#agent-completed').textContent = safeCount(agent.stats?.completed);
  $('#agent-failed').textContent = safeCount(agent.stats?.failed);
  $('#agent-awaiting').textContent = safeCount(agent.stats?.awaiting);
  const task = agent.currentTaskId ? ui.state.tasks.find((entry) => entry.id === agent.currentTaskId) : null;
  $('#agent-current-task').textContent = task ? `${agent.status} · ${task.title}` : 'No active task.';
  const orb = $('#agent-orb');
  orb.classList.toggle('is-running', agent.status === 'RUNNING');
  orb.title = agent.status === 'RUNNING' ? 'NOVA is executing a real task.' : 'NOVA is idle.';
}

function renderMetrics() {
  const metrics = ui.state.metrics;
  $('#stat-prospects').textContent = safeCount(metrics.prospects);
  $('#stat-evidence').textContent = safeCount(metrics.facts);
  $('#stat-success').textContent = metrics.successRate === null ? '—' : `${metrics.successRate}%`;
  $('#stat-success-note').textContent =
    metrics.completed + metrics.failed === 0
      ? 'No runs recorded'
      : `${metrics.completed} completed · ${metrics.failed} failed`;
  $('#stat-runs').textContent = safeCount(metrics.researchRuns);
  $('#stat-last-run').textContent = metrics.lastCompletedAt
    ? `Last delivery ${timeText(metrics.lastCompletedAt)}`
    : 'Awaiting first assignment';

  const latest = latestResearch();
  $('#hero-proof').textContent = latest
    ? `${latest.results.prospects.length} PROSPECTS DELIVERED`
    : metrics.failed > 0
      ? 'LAST RUN FAILED'
      : 'NO RUNS YET';
}

function latestResearch() {
  if (!ui.state) return null;
  const id = ui.state.latestResearchTaskId;
  return (
    ui.state.tasks.find((task) => task.id === id) ??
    ui.state.tasks.find(
      (task) => task.type === 'prospect_research' && task.status === 'COMPLETED' && task.results?.prospects?.length
    ) ??
    null
  );
}

function relevantTask() {
  if (!ui.state) return null;
  if (ui.activeTaskId) {
    const active = ui.state.tasks.find((task) => task.id === ui.activeTaskId);
    if (active && ['QUEUED', 'RUNNING', 'FAILED', 'AWAITING_APPROVAL'].includes(active.status)) return active;
  }
  return ui.state.tasks[0] ?? null;
}

function renderLive() {
  const task = relevantTask();
  const status = $('#live-status');
  const body = $('#live-body');
  const heading = $('#live-heading');
  const open = $('#open-live-task');
  clear(body);
  open.hidden = true;

  if (!task) {
    status.textContent = 'IDLE';
    status.className = 'status-pill status-idle';
    heading.textContent = 'Now running';
    body.appendChild(
      el(
        'div',
        { class: 'empty-state compact-empty' },
        el('span', { class: 'empty-glyph', text: '⌁' }),
        el('p', { text: 'No task submitted yet.' }),
        el('span', { text: 'Assign the first mission to start a real run.' })
      )
    );
    return;
  }

  status.textContent = task.status.replace(/_/g, ' ');
  status.className = `status-pill status-${task.status.toLowerCase()}`;
  heading.textContent = task.status === 'RUNNING' || task.status === 'QUEUED' ? 'Now running' : 'Last execution';
  open.hidden = false;
  open.dataset.taskId = task.id;

  body.appendChild(el('p', { class: 'live-task-title', text: task.title }));
  body.appendChild(
    el(
      'div',
      { class: 'live-task-meta' },
      el('span', { text: `${task.type.replace(/_/g, ' ')} · ${task.id}` }),
      el('span', { text: `attempt ${task.attempts ?? 1}` }),
      el('span', { text: `created ${timeText(task.createdAt)}` })
    )
  );

  const percent = task.status === 'COMPLETED' ? 100 : task.progress?.percent ?? 0;
  body.appendChild(
    el(
      'div',
      { class: 'live-phase' },
      el('span', { text: task.progress?.message ?? 'Waiting for execution bridge.' }),
      el('strong', { text: `${percent}%` })
    )
  );
  const fill = el('div', { class: 'progress-fill' });
  fill.style.width = `${percent}%`;
  body.appendChild(el('div', { class: 'progress-track' }, fill));

  if (task.status === 'FAILED' && task.error) {
    body.appendChild(
      el(
        'div',
        { class: 'live-error' },
        el('strong', { text: `${task.error.code ?? 'EXECUTION_FAILED'}${task.error.recoverable ? ' · RECOVERABLE' : ''}` }),
        el('p', { text: task.error.message })
      )
    );
  }

  if (task.status === 'AWAITING_APPROVAL') {
    body.appendChild(
      el(
        'div',
        { class: 'live-error', style: 'border-left-color:var(--amber)' },
        el('strong', { text: 'AWAITING HUMAN APPROVAL' }),
        el('p', { text: 'The draft is delivered. No message has been sent. Review it in Approvals.' })
      )
    );
  }

  if (task.status === 'COMPLETED' && task.results?.prospects) {
    body.appendChild(
      el(
        'div',
        { class: 'live-task-meta' },
        el('span', { text: `${task.results.prospects.length} prospects` }),
        el('span', { text: `${task.results.prospects.reduce((n, p) => n + (p.facts?.length ?? 0), 0)} facts` }),
        el('span', { text: task.delivery?.verified ? 'delivery verified' : 'delivery unverified' }),
        el('span', { text: formatDuration(task.durationMs) })
      )
    );
  }

  const events = (task.events ?? []).slice(-4);
  if (events.length) {
    body.appendChild(
      el(
        'div',
        { class: 'live-log', 'aria-label': 'Recent execution events' },
        ...events.map((event) =>
          el(
            'div',
            { class: 'live-log-row' },
            timeNode(event.at, 'short'),
            el('span', { text: event.message })
          )
        )
      )
    );
  }

  const actions = el('div', { class: 'live-actions' });
  if (task.status === 'FAILED') {
    actions.appendChild(
      el('button', { class: 'button button-small button-danger', type: 'button', onclick: () => retryTask(task.id) }, 'Retry task')
    );
  }
  if (task.status === 'COMPLETED' && task.results?.prospects?.length) {
    actions.appendChild(
      el(
        'button',
        { class: 'button button-small button-primary', type: 'button', onclick: () => switchView('prospects') },
        'Inspect results'
      )
    );
  }
  if (task.status === 'AWAITING_APPROVAL') {
    actions.appendChild(
      el('button', { class: 'button button-small button-primary', type: 'button', onclick: () => switchView('approvals') }, 'Open approvals')
    );
  }
  body.appendChild(actions);
}

function renderLatestResults() {
  const list = $('#latest-results-list');
  clear(list);
  const task = latestResearch();
  if (!task) {
    list.appendChild(
      el(
        'div',
        { class: 'empty-state' },
        el('span', { class: 'empty-glyph', text: '◎' }),
        el('p', { text: 'No delivered research yet.' }),
        el('span', { text: 'The first assignment will populate this board with sourced findings.' })
      )
    );
    return;
  }
  for (const prospect of task.results.prospects.slice(0, 3)) {
    list.appendChild(prospectCard(prospect, task, true));
  }
}

function renderProspects() {
  const list = $('#prospects-list');
  clear(list);
  const task = latestResearch();
  if (!task) {
    const failed = ui.state.tasks.find((entry) => entry.type === 'prospect_research' && entry.status === 'FAILED');
    list.appendChild(
      el(
        'div',
        { class: 'empty-state wide-empty' },
        el('span', { class: 'empty-glyph', text: '◎' }),
        el('p', { text: failed ? 'Latest research failed.' : 'No prospects delivered yet.' }),
        el('span', {
          text: failed
            ? `${failed.error?.message ?? 'Execution failed.'} No substitute or fabricated results were produced.`
            : 'Assign the first mission from Overview. NOVA will not invent results if discovery or inspection fails.'
        })
      )
    );
    return;
  }

  const query = ui.searchProspects.trim().toLowerCase();
  const prospects = task.results.prospects.filter((prospect) => {
    if (!query) return true;
    return `${prospect.name} ${prospect.location} ${prospect.opportunity?.headline}`.toLowerCase().includes(query);
  });

  if (!prospects.length) {
    list.appendChild(
      el(
        'div',
        { class: 'empty-state wide-empty' },
        el('p', { text: `No prospects match “${ui.searchProspects}”.` }),
        el('span', { text: 'Clear the filter to see the full delivered board.' })
      )
    );
    return;
  }

  const meta = el(
    'div',
    { class: 'view-actions', style: 'grid-column:1/-1;justify-content:space-between;width:100%' },
    el('span', {
      class: 'micro-label',
      text: `DELIVERED ${timeText(task.completedAt).toUpperCase()} · ${task.results.prospects.length} PROSPECTS`
    }),
    el('span', { class: 'micro-label', text: 'STATIC HTML AUDIT · JAVASCRIPT NOT EXECUTED' })
  );
  list.appendChild(meta);
  for (const prospect of prospects) list.appendChild(prospectCard(prospect, task, false));
}

function prospectCard(prospect, task, compact) {
  const card = el('article', {
    class: 'prospect-card',
    dataset: { priority: prospect.opportunity?.priority ?? 'REVIEW' },
    'aria-label': `${prospect.name}, ${prospect.verification?.status ?? 'unverified'}`
  });
  const inner = el('div', { class: 'prospect-card-inner' });
  const siteUrl = safeHref(prospect.website?.url);
  const host = siteUrl ? new URL(siteUrl).hostname.replace(/^www\./, '') : null;

  inner.appendChild(
    el(
      'div',
      { class: 'prospect-topline' },
      el('span', { class: 'prospect-rank', text: `PROSPECT ${String(prospect.rank ?? '—').padStart(2, '0')}` }),
      el('div', { class: 'prospect-badges' }, priorityChip(prospect.opportunity?.priority), verificationChip(prospect))
    )
  );
  inner.appendChild(el('h3', { class: 'prospect-name', text: prospect.name }));
  inner.appendChild(el('p', { class: 'prospect-location', text: prospect.location }));
  inner.appendChild(
    el(
      'div',
      { class: 'prospect-site' },
      el('span', { class: 'micro-label', text: 'SITE' }),
      host
        ? el('a', { href: siteUrl, target: '_blank', rel: 'noopener noreferrer', text: host })
        : el('span', { class: 'site-missing', text: 'No website in source data' }),
      prospect.website?.status ? el('span', { class: 'muted', text: `HTTP ${prospect.website.status}` }) : null
    )
  );

  inner.appendChild(
    el(
      'div',
      { class: 'verify-line' },
      el('span', { class: `check-tag ${prospect.verification?.identity === 'MATCHED' ? 'ok' : 'warn'}`, text: 'NAME' }),
      el('span', { class: `check-tag ${prospect.verification?.location === 'MATCHED' ? 'ok' : 'warn'}`, text: 'LOCATION' }),
      el('span', { class: `check-tag ${prospect.website?.verified ? 'ok' : 'warn'}`, text: 'WEBSITE' }),
      el('span', { class: 'check-tag', text: timeText(prospect.researchedAt, 'date') })
    )
  );

  const opportunity = prospect.opportunity ?? {};
  inner.appendChild(
    el(
      'div',
      { class: 'prospect-opportunity' },
      el('h4', { text: opportunity.headline ?? 'No opportunity synthesized.' }),
      el('p', { text: opportunity.summary ?? '' }),
      compact
        ? null
        : el(
            'div',
            { class: 'prospect-signals' },
            ...(opportunity.signals ?? []).slice(0, 4).map((signal) =>
              el('span', { class: 'signal-chip', text: signal.label, title: signal.recommendation ?? '' })
            )
          )
    )
  );

  const counts = el(
    'div',
    { class: 'prospect-counts' },
    el('span', {}, el('strong', { text: String(prospect.facts?.length ?? 0) }), ' facts'),
    el('span', {}, el('strong', { text: String(prospect.assumptions?.length ?? 0) }), ' assumptions')
  );
  const actions = el(
    'div',
    { class: 'prospect-actions' },
    el(
      'button',
      { class: 'text-button', type: 'button', onclick: () => openEvidence(task.id, prospect.id) },
      'Evidence',
      el('span', { 'aria-hidden': 'true', text: '↗' })
    ),
    task.status === 'COMPLETED'
      ? el(
          'button',
          {
            class: 'text-button',
            type: 'button',
            onclick: () => createDraft(task.id, prospect.id)
          },
          'Draft outreach'
        )
      : null
  );
  inner.appendChild(el('div', { class: 'prospect-foot' }, counts, actions));
  card.appendChild(inner);
  return card;
}

function renderTasks() {
  const list = $('#tasks-list');
  clear(list);
  const tasks = ui.state.tasks;
  if (!tasks.length) {
    list.appendChild(el('div', { class: 'empty-state wide-empty' }, el('p', { text: 'No tasks recorded.' })));
    return;
  }
  for (const task of tasks.slice(0, 30)) {
    const row = el('article', { class: 'task-row' });
    row.appendChild(
      el(
        'div',
        { class: 'task-title' },
        el('strong', { text: task.title }),
        el('span', { text: `${task.id} · ${task.type.replace(/_/g, ' ')} · attempt ${task.attempts ?? 1}` }),
        task.status === 'RUNNING'
          ? el(
              'div',
              { class: 'task-progress-mini' },
              Object.assign(el('div'), { style: `width:${task.progress?.percent ?? 0}%` })
            )
          : null
      )
    );
    row.appendChild(el('div', { class: 'task-cell' }, statusPill(task.status)));
    row.appendChild(
      el(
        'div',
        { class: 'task-cell' },
        el('span', { text: 'CREATED' }),
        timeText(task.createdAt, 'date')
      )
    );
    row.appendChild(
      el(
        'div',
        { class: 'task-cell' },
        el('span', { text: 'DURATION' }),
        task.durationMs != null ? formatDuration(task.durationMs) : '—'
      )
    );
    const actions = el('div', { class: 'task-actions' });
    actions.appendChild(
      el('button', { class: 'button button-small button-ghost', type: 'button', onclick: () => openTask(task.id) }, 'Open')
    );
    if (task.status === 'FAILED') {
      actions.appendChild(
        el('button', { class: 'button button-small button-danger', type: 'button', onclick: () => retryTask(task.id) }, 'Retry')
      );
    }
    row.appendChild(actions);
    list.appendChild(row);
  }
}

function renderApprovals() {
  const list = $('#approvals-list');
  clear(list);
  const approvals = ui.state.approvals;
  if (!approvals.length) {
    list.appendChild(
      el(
        'div',
        { class: 'empty-state wide-empty' },
        el('span', { class: 'empty-glyph', text: '⌑' }),
        el('p', { text: 'No drafts awaiting approval.' }),
        el('span', { text: 'Open a delivered prospect and choose “Draft outreach” to create one.' })
      )
    );
    return;
  }
  for (const approval of approvals) {
    const card = el('article', { class: 'approval-card' });
    card.appendChild(
      el(
        'div',
        { class: 'approval-top' },
        el(
          'div',
          {},
          el('span', { class: 'micro-label', text: `APPROVAL ${approval.id}` }),
          el('h3', { text: approval.prospectName }),
          el(
            'div',
            { class: 'approval-meta' },
            el('span', { text: `created ${timeText(approval.createdAt, 'full')}` }),
            el('span', { text: `research ${approval.researchTaskId}` }),
            el('span', { text: `send: ${approval.sendStatus ?? 'NOT_SENT'}` })
          )
        ),
        statusPill(approval.status, approval.status === 'APPROVED' ? 'status-approved' : '')
      )
    );

    card.appendChild(
      el(
        'div',
        { class: 'approval-body' },
        el('p', { class: 'approval-subject', text: `SUBJECT: ${approval.subject}` }),
        el('p', { class: 'approval-recipient', text: `TO: ${approval.recipient}` }),
        el('p', { class: 'approval-draft', text: approval.body })
      )
    );

    if (approval.decision) {
      card.appendChild(
        el(
          'div',
          { class: 'approval-decision', dataset: { decision: approval.decision.decision } },
          `${approval.decision.decision === 'approve' ? 'APPROVED FOR MANUAL USE' : 'REJECTED'} · ${timeText(
            approval.decision.at,
            'full'
          )} · NOT SENT${approval.decision.note ? ` · ${approval.decision.note}` : ''}`
        )
      );
    }

    const actionRow = el('div', { class: 'approval-actions' });
    const note = el('p', {
      class: 'approval-note',
      text: approval.status === 'AWAITING_APPROVAL' ? 'Approval records intent only. AGENT HQ cannot send.' : 'No outbound action occurred.'
    });
    actionRow.appendChild(note);
    const buttons = el('div', { class: 'view-actions' });
    buttons.appendChild(
      el(
        'button',
        {
          class: 'button button-small button-ghost',
          type: 'button',
          onclick: () => copyDraft(approval)
        },
        'Copy draft'
      )
    );
    if (approval.status === 'AWAITING_APPROVAL') {
      buttons.appendChild(
        el(
          'button',
          { class: 'button button-small button-primary', type: 'button', onclick: () => decideApproval(approval.id, 'approve') },
          'Approve for manual use'
        )
      );
      buttons.appendChild(
        el(
          'button',
          { class: 'button button-small button-danger', type: 'button', onclick: () => decideApproval(approval.id, 'reject') },
          'Reject'
        )
      );
    }
    actionRow.appendChild(buttons);
    card.appendChild(actionRow);
    list.appendChild(card);
  }
}

function evidenceGroups(task, query = '') {
  const groups = [];
  for (const prospect of task.results?.prospects ?? []) {
    const facts = (prospect.facts ?? []).filter((fact) => {
      if (!query) return true;
      return `${prospect.name} ${fact.statement} ${fact.source?.url ?? ''} ${fact.method ?? ''}`
        .toLowerCase()
        .includes(query);
    });
    const assumptions = (prospect.assumptions ?? []).filter((assumption) => {
      if (!query) return true;
      return `${prospect.name} ${assumption.statement} ${assumption.rationale ?? ''}`.toLowerCase().includes(query);
    });
    if (query && !facts.length && !assumptions.length) continue;
    groups.push({ prospect, facts, assumptions });
  }
  return groups;
}

function renderEvidence() {
  const list = $('#evidence-list');
  clear(list);
  const task = latestResearch();
  if (!task) {
    list.appendChild(el('div', { class: 'empty-state wide-empty' }, el('p', { text: 'No evidence recorded yet.' })));
    return;
  }
  const query = ui.searchEvidence.trim().toLowerCase();
  const groups = evidenceGroups(task, query);
  if (!groups.length) {
    list.appendChild(
      el(
        'div',
        { class: 'empty-state wide-empty' },
        el('p', { text: `No evidence matches “${ui.searchEvidence}”.` }),
        el('span', { text: 'Clear the filter to see all sourced observations.' })
      )
    );
    return;
  }
  for (const group of groups) {
    const groupNode = el('section', { class: 'evidence-group' });
    groupNode.appendChild(
      el(
        'div',
        { class: 'evidence-group-head' },
        el(
          'div',
          {},
          el('h3', { text: group.prospect.name }),
          el('p', {
            text: `${group.facts.length} verified facts · ${group.assumptions.length} assumptions · researched ${timeText(
              group.prospect.researchedAt,
              'full'
            )}`
          })
        ),
        verificationChip(group.prospect)
      )
    );

    const factsSection = el('div', { class: 'evidence-section' }, el('h4', { text: 'Verified observations' }));
    if (!group.facts.length) {
      factsSection.appendChild(el('p', { class: 'muted', text: 'No facts match the current filter.' }));
    }
    for (const fact of group.facts) {
      const sourceUrl = safeHref(fact.source?.url);
      const factNode = el('div', { class: 'fact' });
      factNode.appendChild(
        el(
          'div',
          {},
          el('p', { text: fact.statement }),
          el(
            'div',
            { class: 'fact-detail' },
            sourceUrl
              ? el('a', { href: sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: `SOURCE: ${fact.source?.label ?? 'link'}` })
              : el('span', { text: `SOURCE: ${fact.source?.label ?? 'unavailable'}` }),
            el('span', { text: `OBSERVED ${timeText(fact.observedAt, 'full')}` }),
            el('span', { text: fact.method ?? 'Direct inspection' })
          )
        ),
        el('span', { class: 'fact-id', text: fact.id })
      );
      factsSection.appendChild(factNode);
    }
    groupNode.appendChild(factsSection);

    const assumptionsSection = el('div', { class: 'evidence-section assumptions' }, el('h4', { text: 'NOVA assessment · assumptions' }));
    if (!group.assumptions.length) {
      assumptionsSection.appendChild(el('p', { class: 'muted', text: 'No assumptions match the current filter.' }));
    }
    for (const assumption of group.assumptions) {
      assumptionsSection.appendChild(
        el(
          'div',
          { class: 'assumption' },
          el(
            'p',
            {},
            el('span', { class: 'assumption-label', text: 'ASSUMPTION' }),
            assumption.statement
          ),
          el('p', { class: 'assumption-meta', text: `WHY: ${assumption.rationale ?? '—'}` }),
          el('p', {
            class: 'assumption-meta',
            text: `BASIS: ${(assumption.basis ?? []).join(', ') || 'none'} · CONFIDENCE: ${(assumption.confidence ?? 'low').toUpperCase()}`
          })
        )
      );
    }
    groupNode.appendChild(assumptionsSection);

    if (group.prospect.sources?.length) {
      const sourcesSection = el('div', { class: 'evidence-section' }, el('h4', { text: 'Sources' }));
      for (const source of group.prospect.sources) {
        const href = safeHref(source);
        sourcesSection.appendChild(
          href
            ? el('p', {}, el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: source }))
            : el('p', { text: source })
        );
      }
      groupNode.appendChild(sourcesSection);
    }
    list.appendChild(groupNode);
  }
}

function renderActivity() {
  const list = $('#activity-list');
  clear(list);
  const activity = ui.state.activity ?? [];
  if (!activity.length) {
    list.appendChild(el('li', { class: 'empty-activity', text: 'No activity recorded.' }));
    return;
  }
  for (const entry of activity.slice(0, 12)) {
    list.appendChild(
      el(
        'li',
        { class: 'activity-item', dataset: { level: entry.level ?? 'info' } },
        timeNode(entry.at, 'short'),
        el('p', { text: entry.message })
      )
    );
  }
}

function renderNavCounts() {
  $('#nav-prospects').textContent = String(ui.state.metrics.prospects);
  $('#nav-tasks').textContent = String(ui.state.tasks.length);
  $('#nav-approvals').textContent = String(ui.state.metrics.pendingApprovals);
}

/* ---------- actions ---------- */

async function submitResearch(event) {
  event.preventDefault();
  const form = $('#research-form');
  const errorNode = $('#form-error');
  errorNode.hidden = true;
  const button = $('#submit-research');
  const payload = {
    type: 'prospect_research',
    input: {
      niche: $('#niche').value.trim(),
      city: $('#city').value.trim(),
      count: Number($('#count').value),
      requestedBy: 'HQ operator'
    }
  };
  button.disabled = true;
  button.querySelector('span').textContent = 'QUEUING…';
  try {
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
    ui.activeTaskId = task.id;
    toast('Task accepted. NOVA is queued for a real research run.', 'info');
    await refreshState();
    switchView('overview');
  } catch (error) {
    errorNode.textContent = error.message;
    errorNode.hidden = false;
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'ASSIGN TO NOVA';
  }
}

async function retryTask(taskId) {
  try {
    const { task } = await api(`/api/tasks/${taskId}/retry`, { method: 'POST', body: '{}' });
    ui.activeTaskId = task.id;
    toast(`Retry queued as ${task.id}.`, 'info');
    await refreshState();
    openTask(task.id);
  } catch (error) {
    toast(`Retry failed: ${error.message}`, 'error');
  }
}

async function createDraft(researchTaskId, prospectId) {
  try {
    ui.pendingApprovalProspect = prospectId;
    const { task } = await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ type: 'outreach_draft', input: { researchTaskId, prospectId } })
    });
    toast(`Draft task ${task.id} queued. It will stop for human approval.`, 'info');
    await refreshState();
  } catch (error) {
    ui.pendingApprovalProspect = null;
    toast(`Could not create draft: ${error.message}`, 'error');
  }
}

async function decideApproval(approvalId, decision) {
  try {
    await api(`/api/approvals/${approvalId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    toast(
      decision === 'approve'
        ? 'Approved for manual use. AGENT HQ did not send anything.'
        : 'Draft rejected. Nothing was sent.',
      decision === 'approve' ? 'info' : 'warn'
    );
    await refreshState();
  } catch (error) {
    toast(`Approval decision failed: ${error.message}`, 'error');
  }
}

async function copyDraft(approval) {
  const text = `Subject: ${approval.subject}\n\n${approval.body}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('Draft copied. Nothing was sent.', 'info');
  } catch {
    toast('Clipboard access failed. Select the draft text manually.', 'warn');
  }
}

/* ---------- dialogs ---------- */

function openDialog() {
  const dialog = $('#detail-dialog');
  if (!dialog.open) dialog.showModal();
}

function closeDialog() {
  const dialog = $('#detail-dialog');
  if (dialog.open) dialog.close();
}

async function openTask(taskId) {
  try {
    const { task } = await api(`/api/tasks/${taskId}`);
    renderTaskDetail(task);
    openDialog();
  } catch (error) {
    toast(`Could not open task: ${error.message}`, 'error');
  }
}

function renderTaskDetail(task) {
  const content = clear($('#detail-content'));
  $('#detail-kicker').textContent = `TASK RECORD · ${task.id}`;
  content.appendChild(el('h2', { class: 'dialog-title', id: 'detail-title', text: task.title }));
  content.appendChild(
    el(
      'div',
      { class: 'view-actions', style: 'margin-top:10px' },
      statusPill(task.status),
      el('span', { class: 'micro-label', text: task.type.replace(/_/g, ' ') }),
      task.delivery?.verified ? el('span', { class: 'status-pill status-verified', text: 'DELIVERY VERIFIED' }) : null
    )
  );
  content.appendChild(
    el('p', {
      class: 'dialog-sub',
      text:
        task.status === 'FAILED'
          ? 'This task failed. No results were delivered and no substitute findings were produced.'
          : task.status === 'AWAITING_APPROVAL'
            ? 'Execution stopped at a human approval gate. Nothing was sent.'
            : 'Execution state, source references and delivery proof are shown below.'
    })
  );

  const grid = el('div', { class: 'dialog-grid' });
  const stat = (label, value) =>
    el('div', { class: 'dialog-stat' }, el('span', { text: label }), el('strong', { text: value }));
  grid.appendChild(stat('CREATED', timeText(task.createdAt, 'full')));
  grid.appendChild(stat('STARTED', task.startedAt ? timeText(task.startedAt, 'full') : '—'));
  grid.appendChild(stat('DURATION', task.durationMs != null ? formatDuration(task.durationMs) : '—'));
  grid.appendChild(stat('ATTEMPT', String(task.attempts ?? 1)));
  content.appendChild(grid);

  if (task.error) {
    const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Failure' }));
    section.appendChild(el('p', { text: `${task.error.code ?? 'EXECUTION_FAILED'} — ${task.error.message}` }));
    section.appendChild(
      el('p', {
        class: 'muted',
        text: task.error.recoverable ? 'This failure is marked recoverable. Retry creates a new task record.' : 'This failure is not automatically recoverable.'
      })
    );
    if (task.status === 'FAILED') {
      section.appendChild(
        el('div', { class: 'dialog-actions' }, el('button', { class: 'button button-small button-primary', type: 'button', onclick: () => { closeDialog(); retryTask(task.id); } }, 'Retry task'))
      );
    }
    content.appendChild(section);
  }

  if (task.delivery) {
    const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Delivery proof' }));
    section.appendChild(
      el(
        'div',
        { class: 'raw-list' },
        el('div', {}, el('span', { text: 'Verification' }), el('strong', { text: task.delivery.verified ? 'PASSED' : 'FAILED' })),
        el('div', {}, el('span', { text: 'Method' }), el('strong', { text: task.delivery.method })),
        el('div', {}, el('span', { text: 'Delivered at' }), el('strong', { text: timeText(task.delivery.deliveredAt, 'full') })),
        el('div', {}, el('span', { text: 'Result hash' }), el('strong', { text: task.delivery.resultHash ?? '—' }))
      )
    );
    section.appendChild(el('p', { class: 'muted', text: `Surfaces: ${(task.delivery.surfaces ?? []).join(' · ')}` }));
    content.appendChild(section);
  }

  if (task.results?.assignment) {
    const results = task.results;
    const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Research assignment' }));
    section.appendChild(
      el(
        'div',
        { class: 'raw-list' },
        el('div', {}, el('span', { text: 'Niche / city' }), el('strong', { text: `${results.assignment.niche} · ${results.assignment.city}` })),
        el('div', {}, el('span', { text: 'Requested' }), el('strong', { text: `${results.assignment.requestedCount} / returned ${results.assignment.returnedCount}` })),
        el('div', {}, el('span', { text: 'Provider' }), el('strong', { text: results.assignment.provider })),
        el('div', {}, el('span', { text: 'Screened' }), el('strong', { text: `${results.screening?.candidateCount ?? 0} candidates / ${results.screening?.audited ?? 0} audited` }))
      )
    );
    content.appendChild(section);

    const prospectsSection = el('div', { class: 'dialog-section' }, el('h3', { text: 'Delivered prospects' }));
    for (const prospect of results.prospects ?? []) {
      prospectsSection.appendChild(
        el(
          'div',
          { class: 'raw-list', style: 'margin-top:8px' },
          el('div', {}, el('span', { text: prospect.name }), el('strong', { text: prospect.verification?.status ?? '—' })),
          el('div', {}, el('span', { text: 'Facts / assumptions' }), el('strong', { text: `${prospect.facts?.length ?? 0} / ${prospect.assumptions?.length ?? 0}` })),
          el(
            'div',
            {},
            el('span', { text: 'Record' }),
            el('button', { class: 'text-button', type: 'button', onclick: () => openEvidence(task.id, prospect.id) }, 'Open evidence →')
          )
        )
      );
    }
    content.appendChild(prospectsSection);

    if (results.limitations?.length) {
      const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Limitations' }));
      const list = el('ul');
      for (const limitation of results.limitations) list.appendChild(el('li', { text: limitation }));
      section.appendChild(list);
      content.appendChild(section);
    }

    if (results.screening?.excluded?.length) {
      const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Screening log' }));
      for (const excluded of results.screening.excluded) {
        section.appendChild(el('p', { text: `${excluded.name}: ${excluded.reason}` }));
      }
      content.appendChild(section);
    }
  }

  if (task.approvalId) {
    const section = el('div', { class: 'dialog-section' }, el('h3', { text: 'Approval' }));
    section.appendChild(el('p', { text: `Approval record: ${task.approvalId}` }));
    if (task.approvalDecision) {
      section.appendChild(
        el('p', {
          class: 'muted',
          text: `${task.approvalDecision.decision === 'approve' ? 'APPROVED FOR MANUAL USE' : 'REJECTED'} · ${timeText(
            task.approvalDecision.at,
            'full'
          )} · NOT SENT${task.approvalDecision.note ? ` · ${task.approvalDecision.note}` : ''}`
        })
      );
    }
    section.appendChild(
      el('div', { class: 'dialog-actions' }, el('button', { class: 'button button-small button-primary', type: 'button', onclick: () => { closeDialog(); switchView('approvals'); } }, 'Open approval queue'))
    );
    content.appendChild(section);
  }

  const eventsSection = el('div', { class: 'dialog-section' }, el('h3', { text: 'Execution events' }));
  if (!(task.events ?? []).length) eventsSection.appendChild(el('p', { class: 'muted', text: 'No events recorded.' }));
  for (const event of task.events ?? []) {
    eventsSection.appendChild(
      el(
        'div',
        { class: 'raw-list' },
        el('div', {}, el('span', { text: timeText(event.at, 'full') }), el('strong', { text: `${event.status} · ${event.message}` }))
      )
    );
  }
  content.appendChild(eventsSection);
}

function openEvidence(taskId, prospectId) {
  const task = ui.state.tasks.find((entry) => entry.id === taskId);
  const prospect = task?.results?.prospects?.find((entry) => entry.id === prospectId);
  if (!task || !prospect) {
    toast('That evidence record is no longer available in local state.', 'warn');
    return;
  }
  const content = clear($('#detail-content'));
  $('#detail-kicker').textContent = `EVIDENCE RECORD · ${prospect.id}`;
  content.appendChild(el('h2', { class: 'dialog-title', id: 'detail-title', text: prospect.name }));
  content.appendChild(el('p', { class: 'dialog-sub', text: prospect.location }));
  content.appendChild(
    el(
      'div',
      { class: 'view-actions', style: 'margin-top:10px' },
      priorityChip(prospect.opportunity?.priority),
      verificationChip(prospect),
      el('span', { class: 'micro-label', text: `RESEARCHED ${timeText(prospect.researchedAt, 'full')}` })
    )
  );
  if (safeHref(prospect.website?.url)) {
    content.appendChild(
      el(
        'p',
        { class: 'dialog-sub' },
        el('a', {
          href: safeHref(prospect.website.finalUrl || prospect.website.url),
          target: '_blank',
          rel: 'noopener noreferrer',
          text: prospect.website.finalUrl || prospect.website.url
        })
      )
    );
  }
  content.appendChild(
    el(
      'div',
      { class: 'dialog-grid' },
      el('div', { class: 'dialog-stat' }, el('span', { text: 'OPPORTUNITY SCORE' }), el('strong', { text: `${prospect.opportunity?.score ?? 0} / 100` })),
      el('div', { class: 'dialog-stat' }, el('span', { text: 'VERIFICATION' }), el('strong', { text: prospect.verification?.status ?? '—' })),
      el('div', { class: 'dialog-stat' }, el('span', { text: 'HTTP STATUS' }), el('strong', { text: prospect.website?.status ? String(prospect.website.status) : '—' })),
      el('div', { class: 'dialog-stat' }, el('span', { text: 'PAGE WEIGHT / TIME' }), el('strong', { text: prospect.website?.bytes ? `${Math.round(prospect.website.bytes / 1024)} KB · ${prospect.website.elapsedMs} ms` : '—' }))
    )
  );

  const oppSection = el('div', { class: 'dialog-section' }, el('h3', { text: 'Assessment (assumption)' }));
  oppSection.appendChild(el('p', { text: prospect.opportunity?.summary ?? 'No assessment available.' }));
  if (prospect.opportunity?.outreachAngle) {
    oppSection.appendChild(el('p', { class: 'muted', text: `Suggested angle: ${prospect.opportunity.outreachAngle}` }));
  }
  content.appendChild(oppSection);

  if (prospect.opportunity?.signals?.length) {
    const signals = el('div', { class: 'dialog-section' }, el('h3', { text: 'Observed signals' }));
    for (const signal of prospect.opportunity.signals) {
      signals.appendChild(
        el(
          'div',
          { class: 'raw-list' },
          el('div', {}, el('span', { text: signal.label }), el('strong', { text: `${signal.severity}/3 · basis ${signal.factId}` })),
          el('p', { class: 'muted', text: signal.recommendation })
        )
      );
    }
    content.appendChild(signals);
  }

  const facts = el('div', { class: 'dialog-section' }, el('h3', { text: `Verified facts (${prospect.facts?.length ?? 0})` }));
  for (const fact of prospect.facts ?? []) {
    const href = safeHref(fact.source?.url);
    facts.appendChild(
      el(
        'div',
        { style: 'padding:9px 0;border-bottom:1px dashed var(--line)' },
        el('p', { text: fact.statement }),
        el(
          'div',
          { class: 'fact-detail' },
          href
            ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: fact.source?.label ?? 'source' })
            : el('span', { text: fact.source?.label ?? 'source unavailable' }),
          el('span', { text: timeText(fact.observedAt, 'full') }),
          el('span', { text: fact.method }),
          el('span', { text: fact.id })
        )
      )
    );
  }
  content.appendChild(facts);

  const assumptions = el('div', { class: 'dialog-section' }, el('h3', { text: `Assumptions (${prospect.assumptions?.length ?? 0})` }));
  for (const assumption of prospect.assumptions ?? []) {
    assumptions.appendChild(
      el(
        'div',
        { style: 'padding:9px 0;border-bottom:1px dashed var(--line)' },
        el('p', { text: `ASSUMPTION — ${assumption.statement}` }),
        el('p', { class: 'muted', text: `Why: ${assumption.rationale ?? '—'}` }),
        el('p', { class: 'fact-detail', text: `Basis: ${(assumption.basis ?? []).join(', ')} · confidence ${assumption.confidence ?? 'low'}` })
      )
    );
  }
  content.appendChild(assumptions);

  if (task.status === 'COMPLETED') {
    content.appendChild(
      el(
        'div',
        { class: 'dialog-actions' },
        el(
          'button',
          { class: 'button button-primary', type: 'button', onclick: () => { closeDialog(); createDraft(task.id, prospect.id); } },
          'Draft outreach (approval required)'
        ),
        el('button', { class: 'button button-ghost', type: 'button', onclick: () => { closeDialog(); openTask(task.id); } }, 'Open task record')
      )
    );
  }
  openDialog();
}

/* ---------- events / boot ---------- */

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.nav));
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });
  $('#research-form').addEventListener('submit', submitResearch);
  $('#fill-assignment').addEventListener('click', () => {
    $('#niche').value = 'bakery';
    $('#city').value = 'Portland, Oregon';
    $('#count').value = '3';
    $('#form-error').hidden = true;
    toast('First mission restored: 3 bakeries in Portland, Oregon.', 'info');
  });
  $('#prospect-search').addEventListener('input', (event) => {
    ui.searchProspects = event.target.value;
    renderProspects();
  });
  $('#evidence-search').addEventListener('input', (event) => {
    ui.searchEvidence = event.target.value;
    renderEvidence();
  });
  $('#detail-close').addEventListener('click', closeDialog);
  $('#detail-dialog').addEventListener('click', (event) => {
    if (event.target === $('#detail-dialog')) closeDialog();
  });
  $('#open-live-task').addEventListener('click', (event) => {
    const taskId = event.currentTarget.dataset.taskId;
    if (taskId) openTask(taskId);
  });
}

function updateClock() {
  const now = new Date();
  $('#utc-clock').textContent = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(
    2,
    '0'
  )}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
}

async function init() {
  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(refreshRelativeTimes, 15_000);
  const hash = location.hash.replace('#', '');
  if (['overview', 'prospects', 'tasks', 'approvals', 'evidence'].includes(hash)) switchView(hash);
  await refreshHealth();
  await refreshState();
  connectEvents();
  setInterval(() => {
    if (!ui.bridgeOnline) void refreshState();
  }, 5000);
}

init();
