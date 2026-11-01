const icons = {
  close: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.2"/></svg>',
  arrow: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9.5M9 4.5L12.5 8 9 11.5" stroke="currentColor" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  target: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="4.4" stroke="currentColor" stroke-width="1"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.4 3.2l7.2 4.8-7.2 4.8V3.2z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.2 3.5v9M10.8 3.5v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  users: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="6" cy="6" r="2.3" stroke="currentColor" stroke-width="1"/><path d="M2.2 13c.2-2.3 1.7-3.6 3.8-3.6s3.6 1.3 3.8 3.6M10.2 5.1a2 2 0 010 3.7M11 9.7c1.5.3 2.4 1.4 2.7 3.3" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>',
  layers: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2l5.5 2.9L8 7.8 2.5 4.9 8 2zM2.5 8L8 10.9 13.5 8M2.5 11l5.5 2.9 5.5-2.9" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>',
}

function escape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export class UI {
  constructor(simulation) {
    this.sim = simulation
    this.selectedId = null
    this.mode = null
    this.lastRenderKey = ''
    this.feedItems = new Map()
    this.toastTimers = new Map()
    this.callbacks = {}

    this.el = {
      agentPanel: document.querySelector('#agent-panel'),
      consolePanel: document.querySelector('#console-panel'),
      roster: document.querySelector('#roster-list'),
      feed: document.querySelector('#feed-list'),
      completed: document.querySelector('#completed-count'),
      clock: document.querySelector('#live-clock'),
      systemLabel: document.querySelector('#system-label'),
      pauseLabel: document.querySelector('#pause-label'),
      pauseIcon: document.querySelector('#pause-icon'),
      speedValue: document.querySelector('#speed-value'),
      speedButton: document.querySelector('#speed-btn'),
      standupButton: document.querySelector('#standup-btn'),
      standupLabel: document.querySelector('.standup-label'),
      toastRegion: document.querySelector('#toast-region'),
      tooltip: document.querySelector('#hover-tooltip'),
      tooltipLabel: document.querySelector('#tooltip-label'),
      tooltipSub: document.querySelector('#tooltip-sub'),
      cameraMode: document.querySelector('#camera-mode'),
      agentTag: document.querySelector('#agent-tag'),
      tagName: document.querySelector('#tag-name'),
      tagStatus: document.querySelector('#tag-status'),
      helpDialog: document.querySelector('#help-dialog'),
      boot: document.querySelector('#boot-screen'),
      bootProgress: document.querySelector('#boot-progress'),
      bootStatus: document.querySelector('#boot-status'),
    }

    this.buildRoster()
    this.renderFeed()
    this.updateClock()
    this.setInterval = window.setInterval(() => this.tick(), 450)
    this.clockInterval = window.setInterval(() => this.updateClock(), 1000)
    this.bindStaticEvents()
    this.updateControls()
  }

  on(name, callback) {
    this.callbacks[name] = callback
    return this
  }

  emit(name, ...args) {
    this.callbacks[name]?.(...args)
  }

  bindStaticEvents() {
    const { el } = this

    el.roster.addEventListener('click', (event) => {
      const button = event.target.closest('[data-agent-id]')
      if (!button) return
      this.emit('select-agent', button.dataset.agentId)
    })

    el.agentPanel.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-action]')
      const directiveButton = event.target.closest('[data-directive]')
      if (directiveButton && this.selectedId) {
        this.emit('directive', this.selectedId, directiveButton.dataset.directive)
        return
      }
      if (!actionButton) return
      const action = actionButton.dataset.action
      if (action === 'clear') this.emit('clear')
      if (action === 'focus' && this.selectedId) this.emit('focus-agent', this.selectedId)
    })

    el.consolePanel.addEventListener('click', (event) => {
      const actionButton = event.target.closest('[data-console-action]')
      if (actionButton) {
        this.emit('console-action', actionButton.dataset.consoleAction)
        return
      }
      if (event.target.closest('[data-action="clear"]')) this.emit('clear')
    })

    document.querySelector('#pause-btn').addEventListener('click', () => this.emit('toggle-pause'))
    document.querySelector('#speed-btn').addEventListener('click', () => this.emit('speed'))
    document.querySelector('#standup-btn').addEventListener('click', () => this.emit('standup'))
    document.querySelector('#zoom-in').addEventListener('click', () => this.emit('zoom', -1))
    document.querySelector('#zoom-out').addEventListener('click', () => this.emit('zoom', 1))
    document.querySelector('#reset-camera').addEventListener('click', () => this.emit('reset-camera'))
    document.querySelector('#brand-home').addEventListener('click', (event) => {
      event.preventDefault()
      this.emit('reset-camera')
    })

    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => this.emit('view', button.dataset.view))
    })

    const help = el.helpDialog
    document.querySelector('#help-open').addEventListener('click', () => {
      if (typeof help.showModal === 'function') help.showModal()
      else help.setAttribute('open', '')
    })
    document.querySelector('#help-close').addEventListener('click', () => help.close())
    help.addEventListener('click', (event) => {
      if (event.target === help) help.close()
    })

    el.standupButton.addEventListener('animationend', () => {})
  }

  buildRoster() {
    this.el.roster.innerHTML = this.sim.agents
      .map((agent) => `
        <button class="roster-item" type="button" data-agent-id="${agent.id}" aria-label="Select ${escape(agent.name)}, ${escape(agent.role)}" aria-pressed="false">
          <span class="roster-index">${String(agent.index).padStart(2, '0')}</span>
          <span class="roster-avatar">${escape(agent.name[0])}</span>
          <span class="roster-copy">
            <span class="roster-name">${escape(agent.name)}</span>
            <span class="roster-role">${escape(agent.role)}</span>
          </span>
          <span class="roster-side">
            <span class="roster-status"><i></i><span data-roster-status>${escape(agent.status)}</span></span>
            <span class="roster-progress"><span data-roster-progress></span></span>
          </span>
        </button>
      `)
      .join('')
  }

  renderFeed() {
    this.el.feed.innerHTML = ''
    this.feedItems.clear()
    const fragment = document.createDocumentFragment()
    this.sim.feed.forEach((item) => {
      const node = this.createFeedNode(item)
      fragment.append(node)
      this.feedItems.set(item.id, node)
    })
    this.el.feed.append(fragment)
    this.el.feed.scrollTop = 0
  }

  createFeedNode(item) {
    const wrapper = document.createElement('div')
    wrapper.className = `feed-item${item.tone && item.tone !== 'normal' ? ` is-${item.tone}` : ''}`
    wrapper.dataset.feedId = item.id

    const time = document.createElement('span')
    time.className = 'feed-time'
    time.textContent = item.time

    const copy = document.createElement('div')
    copy.className = 'feed-copy'
    const paragraph = document.createElement('p')
    paragraph.textContent = item.message
    copy.append(paragraph)
    if (item.meta) {
      const meta = document.createElement('small')
      meta.textContent = item.meta
      copy.append(meta)
    }

    wrapper.append(time, copy)
    return wrapper
  }

  addFeed(item) {
    if (this.feedItems.has(item.id)) return
    const node = this.createFeedNode(item)
    this.el.feed.prepend(node)
    this.feedItems.set(item.id, node)
    while (this.el.feed.children.length > 24) {
      const last = this.el.feed.lastElementChild
      const id = Number(last.dataset.feedId)
      last.remove()
      this.feedItems.delete(id)
    }
    this.el.feed.scrollTop = 0
  }

  showAgent(agent) {
    this.mode = 'agent'
    this.selectedId = agent.id
    this.lastRenderKey = ''
    this.el.consolePanel.classList.add('is-hidden')
    this.el.agentPanel.classList.remove('is-hidden')
    this.renderAgent(agent)
    this.updateRosterSelection()
    this.el.tagName.textContent = agent.name.toUpperCase()
    this.el.tagStatus.textContent = this.sim.statusOf(agent)
    this.el.agentTag.classList.remove('is-hidden')
  }

  showConsole() {
    this.mode = 'console'
    this.selectedId = null
    this.lastRenderKey = ''
    this.el.agentPanel.classList.add('is-hidden')
    this.el.consolePanel.classList.remove('is-hidden')
    this.renderConsole()
    this.updateRosterSelection()
    this.el.agentTag.classList.add('is-hidden')
  }

  clearSelection() {
    this.mode = null
    this.selectedId = null
    this.lastRenderKey = ''
    this.el.agentPanel.classList.add('is-hidden')
    this.el.consolePanel.classList.add('is-hidden')
    this.updateRosterSelection()
    this.el.agentTag.classList.add('is-hidden')
  }

  renderAgent(agent) {
    const progress = Math.round(agent.progress * 100)
    const status = this.sim.statusOf(agent)
    const active = !this.sim.paused
    const task = agent.tasks[agent.taskIndex]
    const modeLabel = agent.mode === 'desk' ? 'AT DESK' : agent.mode === 'meeting' ? 'BOARDROOM' : 'IN TRANSIT'
    const progressLabel = this.sim.paused
      ? 'ON HOLD'
      : agent.mode === 'desk'
        ? 'IN PROGRESS'
        : agent.mode === 'meeting'
          ? 'AT STAND-UP'
          : 'IN TRANSIT'

    this.el.agentPanel.innerHTML = `
      <div class="panel-topline">
        <span class="panel-kicker">UNIT ${String(agent.index).padStart(2, '0')} / SELECTED</span>
        <button class="panel-close" type="button" data-action="clear" aria-label="Clear selection">${icons.close}</button>
      </div>
      <div class="agent-identity">
        <div class="monogram" aria-hidden="true">${escape(agent.name[0])}</div>
        <div>
          <h2 class="agent-name">${escape(agent.name)}</h2>
          <p class="agent-role">${escape(agent.role)}</p>
        </div>
      </div>
      <div class="agent-status-row">
        <span class="status-pill${active ? ' is-active' : ''}"><span class="status-dot"></span><span data-agent-status>${escape(status)}</span></span>
        <span class="status-meta">${modeLabel} · ${escape(agent.codename)}</span>
      </div>
      <div class="task-label"><span>CURRENT TASK</span><span>THREAD / 04</span></div>
      <p class="current-task" data-current-task>${escape(task.label)}</p>
      <div class="progress-meta"><span>PROGRESS</span><span><strong data-progress-value>${progress}%</strong> ${progressLabel}</span></div>
      <div class="progress-track"><span class="progress-fill" data-progress-fill style="width:${progress}%"></span></div>
      <div class="directives">
        <div class="task-label"><span>ISSUE DIRECTIVE</span><span>IMMEDIATE</span></div>
        <div class="directive-row">
          <button class="directive-btn" type="button" data-directive="analyze">ANALYZE</button>
          <button class="directive-btn" type="button" data-directive="review">REVIEW</button>
          <button class="directive-btn" type="button" data-directive="sync">SYNC</button>
        </div>
      </div>
      <div class="agent-metrics">
        <div class="agent-metric"><span>OUTPUT</span><b>${agent.tasksCompleted} tasks</b></div>
        <div class="agent-metric"><span>FOCUS</span><b>${agent.metrics.focus}%</b></div>
        <div class="agent-metric"><span>TOKENS</span><b>${agent.metrics.tokens}</b></div>
      </div>
      <button class="focus-btn" type="button" data-action="focus">
        <span>FOCUS CAMERA ON ${escape(agent.name.toUpperCase())}</span>
        ${icons.target}
      </button>
      <div class="agent-footnote"><span>DIRECTIVE CHANNEL / SECURE</span><span>AGENT-0${agent.index} · ONLINE</span></div>
    `
    this.lastRenderKey = this.agentKey(agent)
  }

  agentKey(agent) {
    return `${agent.id}:${agent.taskIndex}:${this.sim.statusOf(agent)}:${agent.mode}:${this.sim.paused}`
  }

  renderConsole() {
    const tasks = this.sim.agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0)
    const meeting = Boolean(this.sim.meeting)
    this.el.consolePanel.innerHTML = `
      <div class="panel-topline">
        <span class="panel-kicker">EXECUTIVE CONSOLE / FLOOR 05</span>
        <button class="panel-close" type="button" data-action="clear" aria-label="Close executive console">${icons.close}</button>
      </div>
      <div class="console-heading">
        <div>
          <h2 class="console-title">AGENT <i>/</i> HQ</h2>
          <p class="console-sub">ORCHESTRATION CONTROL</p>
        </div>
      </div>
      <div class="console-rule"></div>
      <div class="console-metrics">
        <div class="console-metric"><span>AGENTS</span><b>05<small>LIVE</small></b></div>
        <div class="console-metric"><span>OUTPUT</span><b>${tasks}</b></div>
        <div class="console-metric"><span>UPTIME</span><b>99.2<small>%</small></b></div>
        <div class="console-metric"><span>SYNC</span><b>12<small>MS</small></b></div>
      </div>
      <div class="console-actions">
        <button class="console-action is-primary" type="button" data-console-action="standup">
          <span>${meeting ? 'STAND-UP IN SESSION' : 'CONVENE STAND-UP'}</span>${icons.arrow}
        </button>
        <button class="console-action" type="button" data-console-action="pause">
          <span>${this.sim.paused ? 'RESUME OPERATIONS' : 'PAUSE OPERATIONS'}</span>${this.sim.paused ? icons.play : icons.pause}
        </button>
        <button class="console-action" type="button" data-console-action="top">
          <span>TOP-DOWN OVERVIEW</span>${icons.layers}
        </button>
      </div>
      <p class="console-note">Executive access confirmed. Floor-wide commands are simulated locally and broadcast to all five agents.</p>
    `
    this.lastRenderKey = `console:${tasks}:${meeting}:${this.sim.paused}`
  }

  updateRosterSelection() {
    this.el.roster.querySelectorAll('[data-agent-id]').forEach((button) => {
      const active = button.dataset.agentId === this.selectedId
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  updateControls() {
    const paused = this.sim.paused
    this.el.pauseLabel.textContent = paused ? 'RESUME' : 'PAUSE'
    this.el.pauseIcon.innerHTML = paused ? icons.play : icons.pause
    this.el.speedValue.textContent = `${this.sim.speed}×`
    this.el.systemLabel.textContent = paused ? 'SIMULATION PAUSED' : 'CORE ONLINE'
    document.body.classList.toggle('is-paused', paused)
    const meeting = Boolean(this.sim.meeting)
    this.el.standupButton.classList.toggle('is-active', meeting)
    this.el.standupButton.disabled = meeting
    this.el.standupLabel.textContent = meeting ? 'STAND-UP IN SESSION' : 'CONVENE STAND-UP'
    document.querySelectorAll('[data-view]').forEach((button) => {
      const active = button.dataset.view === this.currentView
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    })
  }

  setView(view) {
    this.currentView = view
    this.updateControls()
    this.el.cameraMode.textContent = view === 'top' ? 'TOP-DOWN GRID' : 'ISOMETRIC'
  }

  setFreeCamera() {
    this.currentView = null
    this.updateControls()
    this.el.cameraMode.textContent = 'FREE ORBIT'
  }

  setMeeting(meeting) {
    this.el.standupButton.classList.toggle('is-active', meeting)
    this.el.standupButton.disabled = meeting
    this.el.standupLabel.textContent = meeting ? 'STAND-UP IN SESSION' : 'CONVENE STAND-UP'
    if (this.mode === 'console') this.renderConsole()
    if (this.selectedId && this.mode === 'agent') {
      const agent = this.sim.getAgent(this.selectedId)
      if (agent) this.renderAgent(agent)
    }
  }

  updateClock() {
    this.el.clock.textContent = new Date().toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  tick() {
    const total = this.sim.agents.reduce((sum, agent) => sum + agent.tasksCompleted, 0)
    this.el.completed.textContent = `${total} TASKS`
    this.el.roster.querySelectorAll('[data-agent-id]').forEach((button) => {
      const agent = this.sim.getAgent(button.dataset.agentId)
      if (!agent) return
      const status = this.sim.statusOf(agent)
      const statusLabel = button.querySelector('[data-roster-status]')
      if (statusLabel && statusLabel.textContent !== status) statusLabel.textContent = status
      const progress = button.querySelector('[data-roster-progress]')
      if (progress) progress.style.width = `${Math.round(agent.progress * 100)}%`
    })

    if (this.mode === 'agent' && this.selectedId) {
      const agent = this.sim.getAgent(this.selectedId)
      if (!agent) return
      const key = this.agentKey(agent)
      if (key !== this.lastRenderKey) {
        this.renderAgent(agent)
        this.el.tagStatus.textContent = this.sim.statusOf(agent)
      } else {
        const value = this.el.agentPanel.querySelector('[data-progress-value]')
        const fill = this.el.agentPanel.querySelector('[data-progress-fill]')
        const status = this.el.agentPanel.querySelector('[data-agent-status]')
        if (value) value.textContent = `${Math.round(agent.progress * 100)}%`
        if (fill) fill.style.width = `${Math.round(agent.progress * 100)}%`
        if (status && status.textContent !== this.sim.statusOf(agent)) status.textContent = this.sim.statusOf(agent)
      }
    } else if (this.mode === 'console') {
      const key = `console:${total}:${Boolean(this.sim.meeting)}:${this.sim.paused}`
      if (key !== this.lastRenderKey) this.renderConsole()
    }
  }

  setPaused(paused) {
    this.updateControls()
    if (this.mode === 'console') this.renderConsole()
    if (this.mode === 'agent' && this.selectedId) {
      const agent = this.sim.getAgent(this.selectedId)
      if (agent) this.renderAgent(agent)
    }
    this.toast(paused ? 'Simulation paused · agents standing by' : 'Simulation resumed · telemetry live')
  }

  setSpeed(speed) {
    this.updateControls()
    this.toast(`Simulation tempo set to ${speed}×`)
  }

  toast(message, duration = 2800) {
    const node = document.createElement('div')
    node.className = 'toast'
    node.textContent = message
    this.el.toastRegion.append(node)
    const timer = window.setTimeout(() => {
      node.classList.add('is-leaving')
      window.setTimeout(() => node.remove(), 260)
    }, duration)
    this.toastTimers.set(node, timer)
  }

  showTooltip(data, x, y) {
    if (!data) {
      this.hideTooltip()
      return
    }
    this.el.tooltipLabel.textContent = data.label
    this.el.tooltipSub.textContent = data.sublabel
    this.el.tooltip.style.left = `${x}px`
    this.el.tooltip.style.top = `${y}px`
    this.el.tooltip.classList.add('is-visible')
  }

  hideTooltip() {
    this.el.tooltip.classList.remove('is-visible')
  }

  setCameraMode(label) {
    this.el.cameraMode.textContent = label
  }

  setBootProgress(value, label) {
    this.el.bootProgress.style.width = `${value}%`
    if (label) this.el.bootStatus.textContent = label
  }

  finishBoot() {
    this.el.boot.classList.add('is-complete')
  }

  updateAgentTagPosition(x, y, visible = true) {
    if (this.mode !== 'agent') {
      this.el.agentTag.classList.add('is-hidden')
      return
    }
    if (!visible) {
      this.el.agentTag.classList.add('is-hidden')
      return
    }
    this.el.agentTag.classList.remove('is-hidden')
    this.el.agentTag.style.left = `${x}px`
    this.el.agentTag.style.top = `${y}px`
  }

  destroy() {
    window.clearInterval(this.setInterval)
    window.clearInterval(this.clockInterval)
  }
}
