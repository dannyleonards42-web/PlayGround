const TAU = Math.PI * 2

export const AGENT_SEEDS = [
  {
    id: 'nova',
    index: 1,
    name: 'Nova',
    role: 'Chief of Staff',
    codename: 'A-01',
    tagline: 'Keeps the executive floor in phase.',
    home: { x: -2.65, z: -4.45, rotation: 0 },
    meetingSeat: { x: 7.8, z: -2.55, rotation: Math.PI },
    color: '#e9e2d3',
    seed: 1.2,
    initialProgress: 0.64,
    metrics: { focus: 96, tokens: '2.4M' },
    tasks: [
      { label: 'Synthesizing weekly board brief', short: 'Synthesize board brief', status: 'FOCUSED', duration: 58 },
      { label: 'Reconciling executive calendar', short: 'Reconcile calendar', status: 'COORDINATING', duration: 46 },
      { label: 'Drafting decision memo 04-A', short: 'Draft decision memo', status: 'DRAFTING', duration: 64 },
      { label: 'Reviewing portfolio signals', short: 'Review portfolio', status: 'ANALYZING', duration: 52 },
    ],
  },
  {
    id: 'atlas',
    index: 2,
    name: 'Atlas',
    role: 'Strategy Lead',
    codename: 'A-02',
    tagline: 'Finds the shape of the next quarter.',
    home: { x: -5.65, z: -4.45, rotation: 0 },
    meetingSeat: { x: 6.4, z: -2.6, rotation: Math.PI * 0.72 },
    color: '#ded7c8',
    seed: 2.7,
    initialProgress: 0.38,
    metrics: { focus: 93, tokens: '1.8M' },
    tasks: [
      { label: 'Modeling Q4 expansion scenarios', short: 'Model expansion', status: 'ANALYZING', duration: 72 },
      { label: 'Mapping competitive landscape', short: 'Map landscape', status: 'SYNTHESIZING', duration: 55 },
      { label: 'Calibrating growth forecast', short: 'Calibrate forecast', status: 'MODELING', duration: 61 },
      { label: 'Preparing board scenario deck', short: 'Prepare scenarios', status: 'DRAFTING', duration: 48 },
    ],
  },
  {
    id: 'iris',
    index: 3,
    name: 'Iris',
    role: 'Research Analyst',
    codename: 'A-03',
    tagline: 'Turns noise into an evidence trail.',
    home: { x: -8.55, z: -1.15, rotation: Math.PI / 2 },
    meetingSeat: { x: 9.4, z: -2.6, rotation: -Math.PI * 0.72 },
    color: '#eee9de',
    seed: 4.1,
    initialProgress: 0.77,
    metrics: { focus: 98, tokens: '3.1M' },
    tasks: [
      { label: 'Indexing 1,284 market signals', short: 'Index market signals', status: 'PROCESSING', duration: 68 },
      { label: 'Clustering customer interviews', short: 'Cluster interviews', status: 'ANALYZING', duration: 57 },
      { label: 'Verifying citation graph', short: 'Verify citations', status: 'VERIFYING', duration: 43 },
      { label: 'Summarizing frontier model releases', short: 'Summarize releases', status: 'SYNTHESIZING', duration: 60 },
    ],
  },
  {
    id: 'echo',
    index: 4,
    name: 'Echo',
    role: 'Communications Director',
    codename: 'A-04',
    tagline: 'Makes complexity sound inevitable.',
    home: { x: 0.3, z: -4.45, rotation: 0 },
    meetingSeat: { x: 9.4, z: -5.9, rotation: Math.PI * 0.28 },
    color: '#e3dccd',
    seed: 5.5,
    initialProgress: 0.21,
    metrics: { focus: 91, tokens: '1.2M' },
    tasks: [
      { label: 'Drafting investor narrative', short: 'Draft narrative', status: 'DRAFTING', duration: 53 },
      { label: 'Refining launch messaging', short: 'Refine messaging', status: 'EDITING', duration: 47 },
      { label: 'Reviewing press briefing', short: 'Review briefing', status: 'IN REVIEW', duration: 39 },
      { label: 'Aligning brand taxonomy', short: 'Align taxonomy', status: 'ALIGNING', duration: 58 },
    ],
  },
  {
    id: 'onyx',
    index: 5,
    name: 'Onyx',
    role: 'Operations Engineer',
    codename: 'A-05',
    tagline: 'Keeps every inference on the rails.',
    home: { x: -8.55, z: 2.05, rotation: Math.PI / 2 },
    meetingSeat: { x: 6.4, z: -5.9, rotation: Math.PI * 0.28 },
    color: '#d7d2c8',
    seed: 6.9,
    initialProgress: 0.51,
    metrics: { focus: 95, tokens: '4.7M' },
    tasks: [
      { label: 'Optimizing inference pipeline', short: 'Optimize inference', status: 'BUILDING', duration: 63 },
      { label: 'Auditing agent telemetry', short: 'Audit telemetry', status: 'AUDITING', duration: 49 },
      { label: 'Compiling nightly release', short: 'Compile release', status: 'BUILDING', duration: 54 },
      { label: 'Hardening eval harness', short: 'Harden eval harness', status: 'TESTING', duration: 59 },
    ],
  },
]

const DASHBOARD_EVENTS = [
  ['indexed 214 new market signals', 'Iris'],
  ['raised the confidence floor to 98.6%', 'Nova'],
  ['resolved 3 cross-agent dependencies', 'Onyx'],
  ['compressed the Q4 brief by 18%', 'Echo'],
  ['re-scored 12 expansion scenarios', 'Atlas'],
  ['completed a board-level synthesis pass', 'Nova'],
  ['cleared the inference queue in 41ms', 'Onyx'],
  ['linked 9 sources into the evidence graph', 'Iris'],
  ['refined the investor narrative', 'Echo'],
  ['flagged a new market adjacency', 'Atlas'],
]

const DIRECTIVES = {
  analyze: { status: 'ANALYZING', label: 'Deep analysis protocol', short: 'Deep analysis', duration: 42, note: 'Analysis directive accepted' },
  review: { status: 'IN REVIEW', label: 'Peer review protocol', short: 'Peer review', duration: 34, note: 'Peer review requested' },
  sync: { status: 'SYNCING', label: 'Cross-agent synchronization', short: 'Agent sync', duration: 30, note: 'Synchronization cycle started' },
}

function timeLabel(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export class Simulation {
  constructor() {
    this.agents = AGENT_SEEDS.map((seed) => ({
      ...seed,
      tasks: seed.tasks.map((task) => ({ ...task })),
      taskIndex: 0,
      progress: seed.initialProgress,
      tasksCompleted: 8 + seed.index * 3,
      mode: 'desk',
      position: { x: seed.home.x, z: seed.home.z, rotation: seed.home.rotation },
      path: [],
      pathIndex: 0,
      walkPhase: seed.seed,
      status: seed.tasks[0].status,
      meetingDone: 0,
    }))
    this.paused = false
    this.speed = 1
    this.elapsed = 0
    this.meeting = null
    this.feed = []
    this.feedSeq = 0
    this.nextDashboardEvent = 7 + Math.random() * 5
    this.listeners = new Set()
    this.seedFeed()
  }

  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(type, payload = {}) {
    for (const listener of this.listeners) listener(type, payload)
  }

  addFeed(message, options = {}) {
    const item = {
      id: ++this.feedSeq,
      message,
      agentId: options.agentId || null,
      meta: options.meta || null,
      tone: options.tone || 'normal',
      time: options.time || timeLabel(),
      timestamp: Date.now(),
    }
    this.feed.unshift(item)
    this.feed = this.feed.slice(0, 40)
    this.emit('feed', item)
    return item
  }

  seedFeed() {
    const now = Date.now()
    const seeds = [
      ['Nova synchronized the executive operating brief', 'nova', '2 min ago'],
      ['Onyx completed inference pipeline pass 07', 'onyx', '4 min ago'],
      ['Iris linked 42 sources to the market graph', 'iris', '6 min ago'],
      ['Atlas published three new expansion scenarios', 'atlas', '9 min ago'],
      ['Echo finalized the investor narrative v4', 'echo', '12 min ago'],
      ['Floor 05 reached 99.2% orchestration uptime', null, '18 min ago'],
    ]
    this.feed = seeds.map(([message, agentId, relative], index) => ({
      id: ++this.feedSeq,
      message,
      agentId,
      meta: relative,
      tone: index === 0 ? 'fresh' : 'normal',
      time: timeLabel(new Date(now - (index + 1) * 120000)),
      timestamp: now - (index + 1) * 120000,
    }))
  }

  getAgent(id) {
    return this.agents.find((agent) => agent.id === id)
  }

  get selectedStatus() {
    return this.paused ? 'PAUSED' : 'LIVE'
  }

  togglePause() {
    this.paused = !this.paused
    this.emit('pause', { paused: this.paused })
    this.addFeed(this.paused ? 'Simulation paused by executive command' : 'Simulation resumed — all agents online', {
      tone: this.paused ? 'muted' : 'fresh',
    })
    return this.paused
  }

  setSpeed(speed) {
    this.speed = speed
    this.addFeed(`Simulation tempo set to ${speed}×`, { tone: 'muted' })
    this.emit('speed', { speed })
  }

  prioritize(agentId, directiveKey) {
    const agent = this.getAgent(agentId)
    const directive = DIRECTIVES[directiveKey]
    if (!agent || !directive) return
    if (agent.mode !== 'desk') return

    agent.progress = 0.02
    agent.status = directive.status
    agent.tasks.splice(agent.taskIndex, 0, {
      label: directive.label,
      short: directive.short,
      status: directive.status,
      duration: directive.duration,
    })
    this.addFeed(`${agent.name} ${directive.note.toLowerCase()}`, { agentId, tone: 'accent', meta: 'directive' })
    this.emit('agent', { agentId, reason: 'directive' })
    return agent
  }

  coffee() {
    const agent = this.agents[Math.floor(Math.random() * this.agents.length)]
    if (agent.mode === 'desk') {
      agent.status = 'RECHARGING'
      agent.progress = Math.max(0.03, agent.progress - 0.06)
    }
    this.addFeed(`${agent.name} drew a recharge cycle at The Brief`, { agentId: agent.id, tone: 'accent', meta: 'break room' })
    this.emit('coffee', { agentId: agent.id })
    return agent
  }

  buildRoute(agent) {
    const meetingDoor = { x: 7.15, z: -1.28 }
    const sideStep = agent.home.rotation === 0
      ? { x: agent.home.rotation === 0 && agent.home.x > -4 ? agent.home.x + 0.85 : agent.home.x - 0.85, z: agent.home.z }
      : { x: agent.home.x, z: agent.home.z - 0.7 }
    const aisle = { x: agent.home.x, z: -2.62 }
    const points = [sideStep, aisle, { x: 2.85, z: -2.62 - agent.index * 0.05 }, { x: 5.75, z: -2.62 }, meetingDoor]

    if (agent.meetingSeat.z < -4) {
      const onLeft = agent.meetingSeat.x < 7.8
      points.push({ x: onLeft ? 5.48 : 9.82, z: -3.15 })
      points.push({ x: onLeft ? 5.48 : 9.82, z: agent.meetingSeat.z })
    } else {
      points.push({ x: 7.15, z: agent.meetingSeat.z })
    }
    points.push({ x: agent.meetingSeat.x, z: agent.meetingSeat.z })
    return points
  }

  conveneStandup() {
    if (this.paused) {
      this.emit('notice', { message: 'Resume simulation to convene the stand-up.' })
      return false
    }
    if (this.meeting) {
      this.emit('notice', { message: 'The floor is already in stand-up.' })
      return false
    }

    this.meeting = {
      phase: 'gather',
      startedAt: this.elapsed,
      gatherUntil: this.elapsed + 8.5,
      endAt: this.elapsed + 20,
      returned: false,
    }

    this.agents.forEach((agent) => {
      agent.mode = 'walking'
      agent.status = 'IN TRANSIT'
      const route = this.buildRoute(agent)
      agent.route = route
      agent.path = [...route]
      agent.pathIndex = 0
      agent.walkPhase = agent.seed
      agent.meetingDone = 0
    })

    this.addFeed('Executive stand-up convened in the boardroom', { tone: 'accent', meta: 'floor 05' })
    this.emit('meeting', { active: true })
    return true
  }

  returnFromStandup() {
    if (!this.meeting) return
    this.meeting.phase = 'return'
    this.agents.forEach((agent, index) => {
      agent.mode = 'walking'
      agent.status = 'RETURNING'
      const current = { x: agent.position.x, z: agent.position.z }
      // Retrace the outbound route so agents leave through the boardroom door
      // instead of cutting through glass and furniture on the way home.
      const outbound = [...(agent.route || this.buildRoute(agent))]
      const route = [current, ...outbound.reverse(), { x: agent.home.x, z: agent.home.z }]
      agent.path = route
      agent.pathIndex = 0
      agent.walkPhase = agent.seed + index
    })
    this.addFeed('Stand-up concluded — agents returning to their desks', { tone: 'normal', meta: 'floor 05' })
    this.emit('meeting', { active: true, phase: 'return' })
  }

  completeStandup() {
    this.meeting = null
    this.agents.forEach((agent) => {
      agent.mode = 'desk'
      agent.status = agent.tasks[agent.taskIndex].status
      agent.position.x = agent.home.x
      agent.position.z = agent.home.z
      agent.position.rotation = agent.home.rotation
      agent.path = []
    })
    this.addFeed('All agents back online — task execution resumed', { tone: 'fresh', meta: 'floor 05' })
    this.emit('meeting', { active: false })
  }

  moveAgent(agent, dt) {
    if (agent.pathIndex >= agent.path.length) return true
    const target = agent.path[agent.pathIndex]
    const current = agent.position
    const dist = distance(current, target)
    const step = 2.0 * dt
    if (dist <= step + 0.001) {
      current.x = target.x
      current.z = target.z
      agent.pathIndex += 1
      if (agent.pathIndex >= agent.path.length) return true
    } else {
      const nx = (target.x - current.x) / dist
      const nz = (target.z - current.z) / dist
      current.x += nx * step
      current.z += nz * step
      const targetRotation = Math.atan2(nx, nz)
      let delta = targetRotation - current.rotation
      while (delta > Math.PI) delta -= TAU
      while (delta < -Math.PI) delta += TAU
      current.rotation += delta * Math.min(1, dt * 9)
    }
    agent.walkPhase += dt * 10
    return false
  }

  update(dt) {
    if (this.paused) return
    this.elapsed += dt

    if (this.meeting) {
      if (this.meeting.phase === 'gather' && this.elapsed > this.meeting.gatherUntil) {
        this.meeting.phase = 'meeting'
      }
      if (this.meeting.phase === 'meeting' && this.elapsed > this.meeting.endAt) {
        this.returnFromStandup()
      }
      if (this.meeting?.phase === 'return') {
        let allHome = true
        for (const agent of this.agents) {
          if (agent.mode !== 'walking') continue
          const done = this.moveAgent(agent, dt)
          if (done) {
            agent.mode = 'desk'
            agent.position.x = agent.home.x
            agent.position.z = agent.home.z
            agent.position.rotation = agent.home.rotation
            agent.status = agent.tasks[agent.taskIndex].status
          } else {
            allHome = false
          }
        }
        if (allHome) this.completeStandup()
      } else {
        for (const agent of this.agents) {
          if (agent.mode === 'walking') {
            const done = this.moveAgent(agent, dt)
            if (done) {
              // Face the centre of the boardroom table.
              agent.mode = 'meeting'
              agent.position.rotation = agent.meetingSeat.rotation
              agent.status = 'IN STAND-UP'
            }
          }
        }
      }
    }

    for (const agent of this.agents) {
      if (agent.mode !== 'desk') continue
      const task = agent.tasks[agent.taskIndex]
      const variance = 0.86 + ((agent.index * 37) % 23) / 100
      agent.progress += (dt / task.duration) * variance
      agent.metrics.focus = Math.max(86, Math.min(99, 90 + Math.round(agent.progress * 9)))
      if (agent.progress >= 1) {
        agent.progress = 0
        agent.tasksCompleted += 1
        const completed = task
        agent.taskIndex = (agent.taskIndex + 1) % agent.tasks.length
        const next = agent.tasks[agent.taskIndex]
        agent.status = next.status
        agent.metrics.tokens = `${(Number.parseFloat(agent.metrics.tokens) + 0.1).toFixed(1)}M`
        this.addFeed(`${agent.name} completed “${completed.short}”`, {
          agentId: agent.id,
          tone: 'fresh',
          meta: `${agent.tasksCompleted} tasks`,
        })
        this.emit('agent', { agentId: agent.id, reason: 'task-complete' })
      }
    }

    this.nextDashboardEvent -= dt
    if (this.nextDashboardEvent <= 0) {
      this.nextDashboardEvent = 9 + Math.random() * 8
      const [message, name] = DASHBOARD_EVENTS[Math.floor(Math.random() * DASHBOARD_EVENTS.length)]
      const agent = this.agents.find((entry) => entry.name === name)
      this.addFeed(`${name} ${message}`, {
        agentId: agent?.id || null,
        tone: Math.random() > 0.62 ? 'accent' : 'normal',
        meta: 'telemetry',
      })
      this.emit('tick', {})
    }
  }

  statusOf(agent) {
    if (this.paused) return 'PAUSED'
    if (agent.mode === 'walking') return 'IN TRANSIT'
    if (agent.mode === 'meeting') return 'IN STAND-UP'
    return agent.status
  }

  snapshot() {
    return {
      paused: this.paused,
      speed: this.speed,
      meeting: this.meeting ? { phase: this.meeting.phase } : null,
      agents: this.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        status: this.statusOf(agent),
        progress: agent.progress,
        task: agent.tasks[agent.taskIndex].label,
        position: { ...agent.position },
      })),
    }
  }
}
