import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimate1RM, loadForReps, roundToIncrement, suggestNext, platesPerSide, warmupSets,
  detectPRs, compareVersions, pickActiveRoutine, convertLoad, routineWeek
} from '../src/lib/training.js'

const profile = { unit: 'kg', increments: { upper: 2.5, lower: 5, dumbbell: 2, pin: 1 } }
const bench = { id: 'db-bench-press', logType: 'weight', incrementGroup: 'dumbbell' }
const item = { exerciseId: 'db-bench-press', sets: 3, repRange: [8, 12] }
const sess = (load, reps, extra = {}) => ({ date: '2026-10-01', sets: reps.map(r => ({ load, unit: 'kg', reps: r, ...extra })) })

test('e1RM: single rep equals the load', () => {
  assert.equal(estimate1RM(100, 1), 100)
})

test('e1RM: 100 x 5 lands in a sane range', () => {
  const e = estimate1RM(100, 5)
  assert.ok(e > 112 && e < 118, String(e))
})

test('e1RM: RIR counts as extra reps', () => {
  assert.equal(estimate1RM(100, 5, 2), estimate1RM(100, 7))
})

test('loadForReps inverts estimate1RM', () => {
  const e = estimate1RM(80, 8)
  assert.ok(Math.abs(loadForReps(e, 8) - 80) < 0.5)
})

test('rounding to increments', () => {
  assert.equal(roundToIncrement(41.3, 2.5), 42.5)
  assert.equal(roundToIncrement(41.3, 2.5, 'down'), 40)
  assert.equal(roundToIncrement(7.4, 1), 7)
})

test('suggest: no history gives a start message', () => {
  const s = suggestNext({ item, exercise: bench, history: [], profile })
  assert.equal(s.kind, 'start')
  assert.equal(s.load, null)
  assert.equal(s.reps, 8)
})

test('suggest: hit top of range on all sets → add one increment', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(20, [12, 12, 12])], profile })
  assert.equal(s.kind, 'up')
  assert.equal(s.load, 22)
  assert.equal(s.reps, 8)
})

test('suggest: easy top sets (RIR ≥ 3) → double jump', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(20, [12, 12, 12], { rir: 3 })], profile })
  assert.equal(s.load, 24)
})

test('suggest: inside the range → same weight, +1 rep on the weakest set', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(20, [11, 10, 9])], profile })
  assert.equal(s.kind, 'same')
  assert.equal(s.load, 20)
  assert.equal(s.reps, 10)
})

test('suggest: below range two sessions at the same load → back off', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(30, [6, 6, 5]), sess(30, [7, 6, 6])], profile })
  assert.equal(s.kind, 'down')
  assert.equal(s.load, 26)
})

test('suggest: keeps an off-increment load you actually used', () => {
  const squat = { id: 'barbell-back-squat', logType: 'weight', incrementGroup: 'lower' }
  const s = suggestNext({ item: { ...item, repRange: [6, 8] }, exercise: squat, history: [sess(62.5, [7, 7, 7])], profile })
  assert.equal(s.load, 62.5)
  const up = suggestNext({ item: { ...item, repRange: [6, 8] }, exercise: squat, history: [sess(62.5, [8, 8, 8])], profile })
  assert.equal(up.load, 67.5)
})

test('suggest: switching kg → lb converts and rounds', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(20, [10, 10, 10])], profile: { unit: 'lb', increments: { upper: 5, lower: 10, dumbbell: 5, pin: 1 } } })
  assert.equal(s.unit, 'lb')
  assert.equal(s.load, 45)
})

test('suggest: deload trims ~10%', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(40, [10, 10, 9])], profile, deload: true })
  assert.equal(s.kind, 'deload')
  assert.equal(s.load, 36)
})

test('suggest: machine pins step by 1', () => {
  const curl = { id: 'machine-leg-curl', logType: 'weight', loadUnit: 'pin' }
  const s = suggestNext({ item: { ...item, exerciseId: curl.id }, exercise: curl, history: [{ sets: [8, 8, 8].map(() => ({ load: 7, unit: 'pin', reps: 12 })) }], profile })
  assert.equal(s.unit, 'pin')
  assert.equal(s.load, 8)
})

test('suggest: timed hold builds toward the top of the range', () => {
  const plank = { id: 'plank', logType: 'time' }
  const timed = { exerciseId: 'plank', sets: 2, durationSec: [30, 45] }
  const s = suggestNext({ item: timed, exercise: plank, history: [{ sets: [{ seconds: 35 }, { seconds: 32 }] }], profile })
  assert.equal(s.seconds, 37)
})

test('plates: 100 kg on a 20 kg bar', () => {
  const r = platesPerSide(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25])
  assert.deepEqual(r.perSide, [25, 15])
  assert.equal(r.remainder, 0)
})

test('plates: reports what is unreachable', () => {
  const r = platesPerSide(61, 20, [20, 10, 5, 2.5])
  assert.equal(r.achieved, 60)
  assert.equal(r.remainder, 1)
})

test('warm-ups ramp up and stay below working weight', () => {
  const w = warmupSets(100, 2.5, 20)
  assert.equal(w[0].load, 20)
  assert.ok(w.every(s => s.load < 100))
  assert.deepEqual(w.map(s => s.load), [20, 40, 60, 80])
})

test('PRs ignore first-ever sessions and catch improvements', () => {
  const prev = [{ sets: [{ exerciseId: 'a', load: 50, unit: 'kg', reps: 8 }] }]
  const now = { sets: [{ exerciseId: 'a', load: 52.5, unit: 'kg', reps: 8 }, { exerciseId: 'b', load: 10, unit: 'kg', reps: 10 }] }
  const prs = detectPRs(now, prev, 'kg')
  assert.equal(prs.length, 2)
  assert.ok(prs.every(p => p.exerciseId === 'a'))
})

test('unit conversion', () => {
  assert.ok(Math.abs(convertLoad(100, 'kg', 'lb') - 220.46) < 0.01)
  assert.equal(convertLoad(7, 'pin', 'kg'), 7)
})

test('versions and active routine selection', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1)
  assert.equal(compareVersions('1.0', '1.0.0'), 0)
  const entries = [
    { month: '2026-10', effectiveFrom: '2026-10-01' },
    { month: '2026-11', effectiveFrom: '2026-11-01' }
  ]
  assert.equal(pickActiveRoutine(entries, '2026-10-20').month, '2026-10')
  assert.equal(pickActiveRoutine(entries, '2026-11-01').month, '2026-11')
  assert.equal(pickActiveRoutine(entries, '2026-09-30'), null)
})

test('routine week', () => {
  assert.equal(routineWeek('2026-10-01', new Date(2026, 9, 1)), 1)
  assert.equal(routineWeek('2026-10-01', new Date(2026, 9, 8)), 2)
  assert.equal(routineWeek('2026-10-01', new Date(2026, 9, 22)), 4)
})
