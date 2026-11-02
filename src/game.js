const DIRECTIVE_LABELS = {
  analyze: 'ANALYZE',
  review: 'REVIEW',
  sync: 'SYNC',
}

const BRIEF_TEMPLATES = [
  {
    directive: 'analyze',
    title: 'Audit the landing-page conversion path',
    client: 'NORTHLINE COFFEE',
    agents: ['iris', 'atlas'],
  },
  {
    directive: 'analyze',
    title: 'Map the local-search footprint',
    client: 'TIDELINE REALTY',
    agents: ['iris', 'atlas'],
  },
  {
    directive: 'analyze',
    title: 'Score the onboarding funnel',
    client: 'KITE HEALTH',
    agents: ['iris', 'atlas'],
  },
  {
    directive: 'analyze',
    title: 'Find gaps in the booking journey',
    client: 'FIELDNOTE TRAVEL',
    agents: ['iris', 'atlas'],
  },
  {
    directive: 'review',
    title: 'Review the brand-system handoff',
    client: 'ATELIER VOSS',
    agents: ['nova', 'echo', 'iris'],
  },
  {
    directive: 'review',
    title: 'Review the investor narrative',
    client: 'CIVIC SIGNAL',
    agents: ['nova', 'echo'],
  },
  {
    directive: 'review',
    title: 'Review the homepage wireframe',
    client: 'PARALLEL FITNESS',
    agents: ['nova', 'echo', 'iris'],
  },
  {
    directive: 'review',
    title: 'Review the launch pitch deck',
    client: 'SABLE & CO.',
    agents: ['nova', 'echo'],
  },
  {
    directive: 'sync',
    title: 'Sync the launch-day checklist',
    client: 'ORCHARD ROW',
    agents: ['onyx', 'nova', 'echo'],
  },
  {
    directive: 'sync',
    title: 'Sync analytics and CRM handoff',
    client: 'MERIDIAN LEGAL',
    agents: ['onyx', 'nova'],
  },
  {
    directive: 'sync',
    title: 'Sync the content calendar',
    client: 'HALCYON STUDIO',
    agents: ['onyx', 'echo'],
  },
  {
    directive: 'sync',
    title: 'Sync the retainer delivery plan',
    client: 'CIVIC SIGNAL',
    agents: ['onyx', 'nova', 'echo'],
  },
]

const GRADES = [
  { grade: 'S', minimum: 2400 },
  { grade: 'A', minimum: 1900 },
  { grade: 'B', minimum: 1400 },
  { grade: 'C', minimum: 900 },
  { grade: 'D', minimum: 0 },
]

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function formatShiftTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export class ShiftGame {
  constructor(sim, { duration = 150, maxRequests = 3, rng = Math.random } = {}) {
    this.sim = sim
    this.duration = duration
    this.maxRequests = maxRequests
    this.rng = rng
    this.listeners = new Set()
    this.active = false
    this.ended = false
    this.start()
  }

  onChange(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(type, payload = {}) {
    for (const listener of this.listeners) listener(type, payload)
  }

  reset() {
    this.timeLeft = this.duration
    this.score = 0
    this.confidence = 100
    this.streak = 0
    this.bestStreak = 0
    this.completed = 0
    this.expired = 0
    this.errors = 0
    this.requests = []
    this.requestSeq = 0
    this.nextSpawn = 9
    this.stateClock = 0
    this.endReason = null
    this.grade = null
    this.active = false
    this.ended = false
    this.paused = false
    this.lastBriefKey = ''
  }

  setPaused(paused) {
    if (this.paused === Boolean(paused)) return
    this.paused = Boolean(paused)
    this.emit('state', this.snapshot())
  }

  start() {
    this.reset()
    this.active = true
    this.spawnRequest()
    this.spawnRequest()
    this.nextSpawn = 10 + this.rng() * 4
    this.emit('start', this.snapshot())
    this.emit('requests', this.requests.map((request) => ({ ...request })))
    this.emit('state', this.snapshot())
    return this.snapshot()
  }

  requestDuration() {
    const pressure = Math.min(8, this.completed * 0.55)
    return clamp(33 - pressure + (this.rng() - 0.5) * 4, 23, 36)
  }

  spawnRequest() {
    if (this.requests.length >= this.maxRequests) return null
    const busyAgents = new Set(this.requests.map((request) => request.agentId))
    const idleAgents = this.sim.agents.filter((agent) => !busyAgents.has(agent.id))
    if (!idleAgents.length) return null

    const activeBriefs = new Set(this.requests.map((request) => `${request.client}|${request.title}`))
    const candidates = []
    for (const template of BRIEF_TEMPLATES) {
      if (activeBriefs.has(`${template.client}|${template.title}`)) continue
      for (const agent of idleAgents) {
        if (template.agents.includes(agent.id)) {
          candidates.push({ template, agent })
        }
      }
    }

    const fallbackTemplates = BRIEF_TEMPLATES.filter((template) => !activeBriefs.has(`${template.client}|${template.title}`))
    const pool = candidates.length
      ? candidates
      : idleAgents.map((agent) => ({
        template: fallbackTemplates[Math.floor(this.rng() * fallbackTemplates.length)]
          || BRIEF_TEMPLATES[Math.floor(this.rng() * BRIEF_TEMPLATES.length)],
        agent,
      }))
    const picked = pool[Math.floor(this.rng() * pool.length)]
    const request = {
      id: `brief-${++this.requestSeq}`,
      client: picked.template.client,
      title: picked.template.title,
      directive: picked.template.directive,
      directiveLabel: DIRECTIVE_LABELS[picked.template.directive],
      agentId: picked.agent.id,
      duration: this.requestDuration(),
      timeLeft: 0,
    }
    request.timeLeft = request.duration
    this.requests.push(request)
    this.emit('request', { ...request })
    this.emit('requests', this.requests.map((entry) => ({ ...entry })))
    return request
  }

  requestForAgent(agentId) {
    return this.requests.find((request) => request.agentId === agentId) || null
  }

  requestById(id) {
    return this.requests.find((request) => request.id === id) || null
  }

  dispatch(agentId, directive) {
    if (!this.active || this.ended) return { status: 'inactive' }
    const requests = this.requests.filter((request) => request.agentId === agentId)
    if (!requests.length) return { status: 'none' }

    const match = requests.find((request) => request.directive === directive)
    if (!match) {
      this.confidence = Math.max(0, this.confidence - 6)
      this.errors += 1
      this.streak = 0
      const payload = {
        agentId,
        requested: requests[0].directive,
        issued: directive,
      }
      this.emit('wrong', payload)
      if (this.confidence <= 0) this.end('confidence')
      this.emit('state', this.snapshot())
      return { status: 'wrong', ...payload }
    }

    this.requests = this.requests.filter((request) => request.id !== match.id)
    const speedBonus = Math.round(80 * (match.timeLeft / match.duration))
    const points = 100 + speedBonus + this.streak * 15
    this.score += points
    this.completed += 1
    this.streak += 1
    this.bestStreak = Math.max(this.bestStreak, this.streak)
    this.confidence = Math.min(100, this.confidence + 2)
    if (this.nextSpawn > 4) this.nextSpawn -= 1.2

    this.emit('resolve', {
      request: { ...match },
      points,
      streak: this.streak,
    })
    this.emit('requests', this.requests.map((entry) => ({ ...entry })))
    this.emit('state', this.snapshot())
    return { status: 'matched', points, request: { ...match } }
  }

  update(dt) {
    if (!this.active || this.ended || this.paused || dt <= 0) return
    this.timeLeft = Math.max(0, this.timeLeft - dt)
    this.nextSpawn -= dt

    if (this.nextSpawn <= 0) {
      this.spawnRequest()
      this.nextSpawn = clamp(12 - this.completed * 0.18, 7.5, 13) + this.rng() * 3.5
    }

    const survivors = []
    for (const request of this.requests) {
      request.timeLeft -= dt
      if (request.timeLeft <= 0) {
        this.expired += 1
        this.streak = 0
        this.confidence = Math.max(0, this.confidence - 12)
        this.emit('expire', { request: { ...request } })
      } else {
        survivors.push(request)
      }
    }
    if (survivors.length !== this.requests.length) {
      this.requests = survivors
      this.emit('requests', this.requests.map((entry) => ({ ...entry })))
    }

    if (this.confidence <= 0) {
      this.end('confidence')
      return
    }
    if (this.timeLeft <= 0) {
      this.end('complete')
      return
    }

    this.stateClock -= dt
    if (this.stateClock <= 0) {
      this.stateClock = 0.1
      this.emit('state', this.snapshot())
    }
  }

  end(reason = 'complete') {
    if (this.ended) return
    this.ended = true
    this.active = false
    this.endReason = reason
    this.requests = []
    if (reason === 'confidence') {
      this.grade = 'F'
    } else {
      this.grade = GRADES.find((entry) => this.score >= entry.minimum)?.grade || 'D'
    }
    const report = this.snapshot()
    this.emit('requests', [])
    this.emit('end', report)
    this.emit('state', report)
    return report
  }

  accuracy() {
    const attempts = this.completed + this.errors
    return attempts ? Math.round((this.completed / attempts) * 100) : 100
  }

  snapshot() {
    return {
      active: this.active,
      ended: this.ended,
      paused: this.paused,
      reason: this.endReason,
      duration: this.duration,
      timeLeft: this.timeLeft,
      score: this.score,
      confidence: this.confidence,
      streak: this.streak,
      bestStreak: this.bestStreak,
      completed: this.completed,
      expired: this.expired,
      errors: this.errors,
      accuracy: this.accuracy(),
      grade: this.grade,
      requests: this.requests.map((request) => ({ ...request })),
    }
  }
}

export const SHIFT_DIRECTIVES = DIRECTIVE_LABELS
export const SHIFT_BRIEFS = BRIEF_TEMPLATES
