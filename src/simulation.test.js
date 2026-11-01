import test from 'node:test'
import assert from 'node:assert/strict'
import { Simulation } from './simulation.js'

test('simulation tempo scales the simulation clock', () => {
  const normal = new Simulation()
  const fast = new Simulation()
  fast.setSpeed(2)

  normal.update(0.5)
  fast.update(0.5)

  assert.equal(normal.elapsed, 0.5)
  assert.equal(fast.elapsed, 1)
})

test('task progress grows with tempo', () => {
  const normal = new Simulation()
  const fast = new Simulation()
  fast.setSpeed(2)
  const normalStart = normal.agents[0].progress
  const fastStart = fast.agents[0].progress

  normal.update(1)
  fast.update(1)

  const normalGain = normal.agents[0].progress - normalStart
  const fastGain = fast.agents[0].progress - fastStart
  assert.ok(normalGain > 0)
  assert.ok(Math.abs(fastGain - normalGain * 2) < 1e-9)
})

test('stand-up sends every agent to the boardroom and then home', () => {
  const simulation = new Simulation()
  assert.equal(simulation.conveneStandup(), true)
  assert.ok(simulation.agents.every((agent) => agent.mode === 'walking'))

  // Fast-forward through the walk, meeting and return legs.
  for (let step = 0; step < 400; step += 1) simulation.update(0.1)

  assert.equal(simulation.meeting, null)
  assert.ok(simulation.agents.every((agent) => agent.mode === 'desk'))
  assert.ok(simulation.agents.every((agent) => agent.position.x === agent.home.x && agent.position.z === agent.home.z))
})

test('stand-up cannot be convened twice', () => {
  const simulation = new Simulation()
  assert.equal(simulation.conveneStandup(), true)
  assert.equal(simulation.conveneStandup(), false)
})

test('directives are accepted at the desk and rejected while in transit', () => {
  const simulation = new Simulation()
  assert.ok(simulation.prioritize('nova', 'analyze'))
  assert.equal(simulation.agents[0].status, 'ANALYZING')

  simulation.conveneStandup()
  assert.equal(simulation.prioritize('atlas', 'review'), undefined)
  assert.equal(simulation.getAgent('atlas').status, 'IN TRANSIT')
})

test('pausing freezes progress until resumed', () => {
  const simulation = new Simulation()
  simulation.togglePause()
  const progress = simulation.getAgent('iris').progress
  simulation.update(2)
  assert.equal(simulation.getAgent('iris').progress, progress)
  assert.equal(simulation.elapsed, 0)
})
