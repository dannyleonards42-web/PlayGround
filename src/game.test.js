import test from 'node:test'
import assert from 'node:assert/strict'
import { Simulation } from './simulation.js'
import { ShiftGame, formatShiftTime } from './game.js'

function gameWith(options = {}) {
  return new ShiftGame(new Simulation(), { rng: () => 0.5, ...options })
}

test('a shift starts with two priority briefs and a full clock', () => {
  const game = gameWith()
  assert.equal(game.active, true)
  assert.equal(game.requests.length, 2)
  assert.equal(game.timeLeft, game.duration)
  assert.equal(game.confidence, 100)
  assert.ok(game.requests.every((request) => request.timeLeft === request.duration))
})

test('active briefs never repeat the same client assignment', () => {
  const game = gameWith()
  game.spawnRequest()
  const signatures = game.requests.map((request) => `${request.client}|${request.title}`)
  assert.equal(new Set(signatures).size, signatures.length)
})

test('matching a brief awards points and clears it from the queue', () => {
  const game = gameWith()
  const request = game.requests[0]
  const result = game.dispatch(request.agentId, request.directive)

  assert.equal(result.status, 'matched')
  assert.ok(result.points > 0)
  assert.equal(game.completed, 1)
  assert.equal(game.score, result.points)
  assert.equal(game.streak, 1)
  assert.equal(game.requestById(request.id), null)
})

test('wrong directives cost confidence and leave the brief open', () => {
  const game = gameWith()
  const request = game.requests[0]
  const wrong = ['analyze', 'review', 'sync'].find((directive) => directive !== request.directive)
  const result = game.dispatch(request.agentId, wrong)

  assert.equal(result.status, 'wrong')
  assert.equal(game.errors, 1)
  assert.equal(game.confidence, 94)
  assert.equal(game.streak, 0)
  assert.ok(game.requestById(request.id))
})

test('expired briefs cost confidence and reset the streak', () => {
  const game = gameWith()
  const request = game.requests[0]
  game.streak = 4
  game.requests.forEach((entry) => {
    entry.timeLeft = entry.id === request.id ? 0.05 : 99
  })

  game.update(0.1)

  assert.equal(game.expired, 1)
  assert.equal(game.confidence, 88)
  assert.equal(game.streak, 0)
  assert.equal(game.requestById(request.id), null)
})

test('a shift ends when the clock reaches zero', () => {
  const game = gameWith()
  game.update(game.duration + 1)

  assert.equal(game.active, false)
  assert.equal(game.ended, true)
  assert.equal(game.endReason, 'complete')
  assert.equal(game.timeLeft, 0)
  assert.ok(['S', 'A', 'B', 'C', 'D'].includes(game.grade))
})

test('confidence collapse ends the shift early with an F grade', () => {
  const game = gameWith()
  game.confidence = 8
  game.requests[0].timeLeft = 0.05

  game.update(0.1)

  assert.equal(game.ended, true)
  assert.equal(game.endReason, 'confidence')
  assert.equal(game.grade, 'F')
  assert.equal(game.active, false)
})

test('restarting a shift restores score, confidence and the queue', () => {
  const game = gameWith()
  const request = game.requests[0]
  game.dispatch(request.agentId, request.directive)
  game.confidence = 70

  game.start()

  assert.equal(game.score, 0)
  assert.equal(game.confidence, 100)
  assert.equal(game.completed, 0)
  assert.equal(game.requests.length, 2)
  assert.equal(game.active, true)
})

test('pausing the shift freezes the clock and brief timers', () => {
  const game = gameWith()
  const time = game.timeLeft
  const briefTime = game.requests[0].timeLeft
  game.setPaused(true)
  game.update(5)

  assert.equal(game.timeLeft, time)
  assert.equal(game.requests[0].timeLeft, briefTime)
  game.setPaused(false)
  game.update(1)
  assert.equal(game.timeLeft, time - 1)
})

test('shift time formatting is stable', () => {
  assert.equal(formatShiftTime(150), '02:30')
  assert.equal(formatShiftTime(9.2), '00:10')
  assert.equal(formatShiftTime(-4), '00:00')
})
