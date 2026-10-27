import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  estimate1RM, loadForReps, roundToIncrement, suggestNext, platesPerSide, warmupSets,
  loadableAround, isLoadable, snapToPlates, platesFor, warmupKind, warmupSize,
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
  for (const reps of [1, 3, 5, 8, 10, 12, 15]) {
    for (const rir of [0, 2]) assert.ok(Math.abs(estimate1RM(loadForReps(100, reps, rir), reps, rir) - 100) <= 0.1)
  }
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

test('plates: picks the closest loadable total, even when it is heavier', () => {
  // 25s and 20s only: 57.5 can't be loaded; 60 (a 20 each side) is 2.5 over, the bar alone is 37.5 under
  const r = platesPerSide(57.5, 20, [25, 20])
  assert.deepEqual(r.perSide, [20])
  assert.equal(r.achieved, 60)
  assert.equal(r.remainder, -2.5)
  assert.equal(r.lighter, 20)
})

test('plates: finds exact loads a heaviest-first fill misses', () => {
  // 20 a side with 15s and 10s is 10 + 10, not 15 and stuck
  assert.deepEqual(platesPerSide(60, 20, [15, 10]).perSide, [10, 10])
  assert.equal(platesPerSide(60, 20, [15, 10]).remainder, 0)
})

test('plates: fewest plates, heavier first, sorted', () => {
  assert.deepEqual(platesPerSide(137.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [25, 25, 5, 2.5, 1.25])
  assert.deepEqual(platesPerSide(135, 45, [45, 35, 25, 10, 5, 2.5]).perSide, [45])
})

test('plates: just the bar, and the next option up', () => {
  const r = platesPerSide(22.5, 20, [25, 20])
  assert.deepEqual(r.perSide, [])
  assert.equal(r.achieved, 20)
  assert.equal(r.heavier, 60)
  assert.equal(platesPerSide(20, 20, [25]).remainder, 0)
  assert.ok(platesPerSide(15, 20, [25]).error)
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

// ── v0.3: plans, set types, equipment ──────────────────
import { resolvePlan, plannedSetsFor, equipmentTags, canDoAtGym, isBarbellLift, bestE1RM } from '../src/lib/training.js'

test('plan: month default rir, week overrides, deload drops a set', () => {
  const r = {
    effectiveFrom: '2026-11-01', rir: 2,
    weekPlan: [{ week: 1, rir: 3, focus: 'Find weights' }, { week: 3, rir: 1 }, { week: 4, deload: true }]
  }
  const w1 = resolvePlan(r, new Date(2026, 10, 3))
  assert.equal(w1.week, 1); assert.equal(w1.rir, 3); assert.equal(w1.focus, 'Find weights'); assert.equal(w1.setDelta, 0)
  assert.equal(resolvePlan(r, new Date(2026, 10, 10)).rir, 2) // week 2 falls back to the month default
  const w4 = resolvePlan(r, new Date(2026, 10, 23))
  assert.equal(w4.deload, true); assert.equal(w4.setDelta, -1); assert.equal(w4.loadFactor, 0.9)
  assert.equal(plannedSetsFor({ sets: 3 }, 2, w4), 2)
  assert.equal(plannedSetsFor({ sets: 1 }, 0, w4), 1) // never below one set
})

test('plan: legacy deloadWeek still works', () => {
  const p = resolvePlan({ effectiveFrom: '2026-10-01', deloadWeek: 4 }, new Date(2026, 9, 24))
  assert.equal(p.deload, true); assert.equal(p.setDelta, -1)
})

test('plan: date ranges override the week and can target the first exercise', () => {
  const r = { effectiveFrom: '2026-10-01', rir: 4, datePlan: [{ from: '2026-10-29', to: '2026-10-31', rir: 3, setDelta: 1, applyTo: 'first' }] }
  const p = resolvePlan(r, new Date(2026, 9, 30))
  assert.equal(p.rir, 3)
  assert.equal(plannedSetsFor({ sets: 2 }, 0, p), 3)
  assert.equal(plannedSetsFor({ sets: 2 }, 1, p), 2)
  assert.equal(resolvePlan(r, new Date(2026, 9, 28)).rir, 4)
})

test('suggest: warm-ups and drop sets are ignored', () => {
  const s = suggestNext({
    item, exercise: bench, profile,
    history: [{ sets: [
      { load: 10, unit: 'kg', reps: 10, type: 'warmup' },
      { load: 20, unit: 'kg', reps: 12 }, { load: 20, unit: 'kg', reps: 12 }, { load: 20, unit: 'kg', reps: 12 },
      { load: 12, unit: 'kg', reps: 15, type: 'drop' }
    ] }]
  })
  assert.equal(s.kind, 'up'); assert.equal(s.load, 22)
})

test('suggest: lighter day factor', () => {
  const s = suggestNext({ item, exercise: bench, history: [sess(40, [10, 10, 9])], profile, loadFactor: 0.9, reason: 'Lighter day' })
  assert.equal(s.load, 36); assert.match(s.text, /^Lighter day/)
})

test('records ignore warm-up sets', () => {
  assert.equal(bestE1RM([{ load: 100, unit: 'kg', reps: 5, type: 'warmup' }, { load: 50, unit: 'kg', reps: 1 }], 'kg'), 50)
})

test('equipment tags and gym filter', () => {
  assert.deepEqual(equipmentTags({ equipment: ['Smith machine', 'plate'] }), ['smith'])
  assert.deepEqual(equipmentTags({ equipment: ['dumbbells', 'adjustable bench'] }).sort(), ['bench', 'dumbbells'])
  assert.equal(canDoAtGym({ equipment: ['leg press machine', 'plates'] }, { legpress: false }), false)
  assert.equal(canDoAtGym({ equipment: ['mat'] }, { legpress: false }), true)
  assert.equal(isBarbellLift({ equipment: ['barbell', 'bench', 'bar pad'] }), true)
  assert.equal(isBarbellLift({ equipment: ['cable stack'], loadUnit: 'pin' }), false)
})

import { nextSetAdjust } from '../src/lib/training.js'

test('next set: easy set (more reps left than planned) goes up a jump', () => {
  const r = nextSetAdjust({ load: 60, reps: 8, rir: 4, repRange: [6, 8], targetRir: 2, inc: 2.5, unit: 'kg' })
  assert.equal(r.kind, 'up'); assert.equal(r.why, 'easy'); assert.equal(r.reps, 8)
  assert.equal(r.load, 62.5) // capped at +5%
})

test('next set: on target keeps the weight', () => {
  assert.equal(nextSetAdjust({ load: 60, reps: 8, rir: 2, repRange: [6, 8], targetRir: 2, inc: 2.5, unit: 'kg' }), null)
  assert.equal(nextSetAdjust({ load: 60, reps: 7, rir: null, repRange: [6, 8], inc: 2.5, unit: 'kg' }), null)
})

test('next set: a grinder below the range comes down', () => {
  const r = nextSetAdjust({ load: 60, reps: 5, rir: 0, repRange: [6, 8], targetRir: 2, inc: 2.5, unit: 'kg' })
  assert.equal(r.kind, 'down'); assert.equal(r.why, 'hard'); assert.equal(r.reps, 6)
  assert.ok(r.load >= 54 && r.load <= 57.5, String(r.load))
})

test('next set: without "reps left", only reps outside the range count', () => {
  assert.equal(nextSetAdjust({ load: 100, reps: 4, repRange: [6, 8], inc: 5, unit: 'kg' }).why, 'under')
  const over = nextSetAdjust({ load: 100, reps: 11, repRange: [6, 8], inc: 5, unit: 'kg' })
  assert.equal(over.why, 'over'); assert.equal(over.load, 105); assert.equal(over.reps, 8)
})

test('next set: pins move one at a time; bodyweight and timed are left alone', () => {
  assert.deepEqual(nextSetAdjust({ load: 6, reps: 15, rir: 4, repRange: [10, 12], inc: 1, unit: 'pin' }), { load: 7, reps: 12, kind: 'up', why: 'easy' })
  assert.equal(nextSetAdjust({ load: 6, reps: 8, rir: 0, repRange: [10, 12], inc: 1, unit: 'pin' }).load, 5)
  assert.equal(nextSetAdjust({ load: 0, reps: 8, rir: 4, repRange: [6, 8], inc: 2, unit: 'kg', logType: 'bodyweight' }), null)
  assert.equal(nextSetAdjust({ load: 20, reps: null, rir: null, repRange: null, inc: 2, unit: 'kg' }), null)
})

// ── Loading only what your plates allow ──
const few = [25, 20] // a gym with only 25s and 20s: 20, 60, 70, 100, 110, 120, 140… on a 20 kg bar
const barbellEx = { id: 'barbell-bench-press', logType: 'weight', incrementGroup: 'upper', equipment: ['barbell'] }
const fewProfile = { ...profile, bar: 20, plates: few }

test('loadable totals around a target', () => {
  assert.deepEqual(loadableAround(57.5, 20, few), { below: 20, above: 60 })
  assert.deepEqual(loadableAround(70, 20, few), { below: 70, above: 70 })
  assert.deepEqual(loadableAround(15, 20, few), { below: null, above: 20 })
  assert.ok(isLoadable(110, 20, few))
  assert.ok(!isLoadable(90, 20, few))
  assert.ok(!isLoadable(62.5, 20, few))
  assert.equal(snapToPlates(64, 20, few), 60)
  assert.equal(snapToPlates(65, 20, few), 60) // a tie goes lighter
  assert.equal(snapToPlates(61, 20, few, 'up'), 70)
  assert.deepEqual(platesFor({ unit: 'kg' }), [25, 20, 15, 10, 5, 2.5, 1.25])
  assert.deepEqual(platesFor(fewProfile), few)
})

test('barbell suggestion goes up to the next weight you can load', () => {
  const history = [{ date: '2026-10-01', sets: [{ load: 60, unit: 'kg', reps: 12 }, { load: 60, unit: 'kg', reps: 12 }, { load: 60, unit: 'kg', reps: 12 }] }]
  const s = suggestNext({ item: { sets: 3, repRange: [8, 12] }, exercise: barbellEx, history, profile: fewProfile })
  assert.equal(s.kind, 'up')
  assert.equal(s.load, 70)
  assert.match(s.text, /10 kg/)
  // The full standard set still steps by 2.5
  assert.equal(suggestNext({ item: { sets: 3, repRange: [8, 12] }, exercise: barbellEx, history, profile: { ...profile, bar: 20 } }).load, 62.5)
})

test('barbell deload lands on a loadable lighter weight', () => {
  const history = [{ date: '2026-10-01', sets: [{ load: 100, unit: 'kg', reps: 8 }, { load: 100, unit: 'kg', reps: 8 }, { load: 100, unit: 'kg', reps: 8 }] }]
  const s = suggestNext({ item: { sets: 3, repRange: [8, 12] }, exercise: barbellEx, history, profile: fewProfile, deload: true })
  assert.equal(s.load, 70) // 90 can't be loaded; 70 is the next lighter weight that can
  // Already on the empty bar: nothing lighter, so it stays
  const h2 = [{ date: '2026-10-01', sets: [{ load: 20, unit: 'kg', reps: 8 }] }]
  assert.equal(suggestNext({ item: { sets: 1, repRange: [8, 12] }, exercise: barbellEx, history: h2, profile: fewProfile, deload: true }).load, 20)
})

test('next-set advice on a barbell stays loadable and within its limits', () => {
  const base = { reps: 8, repRange: [8, 12], targetRir: 2, inc: 2.5, unit: 'kg' }
  // Easy set at 60: +5% is 63, nothing loadable in between → keep the weight
  assert.equal(nextSetAdjust({ ...base, load: 60, rir: 4, bar: 20, plates: few }), null)
  // Easy set at 100 with the full set: 105 is fine
  assert.equal(nextSetAdjust({ ...base, load: 100, rir: 4, bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }).load, 105)
  // Grinder at 120 with 25s/20s: −10% reaches 108, and 110 is loadable
  const down = nextSetAdjust({ ...base, load: 120, reps: 6, rir: 0, bar: 20, plates: few })
  assert.equal(down.load, 110)
  // Grinder at 100: the next lighter is 70, past −10% → keep the weight
  assert.equal(nextSetAdjust({ ...base, load: 100, reps: 6, rir: 0, bar: 20, plates: few }), null)
  // Grinder at 60: the next lighter is the bar, far past −10% → keep the weight
  assert.equal(nextSetAdjust({ ...base, load: 60, reps: 6, rir: 0, bar: 20, plates: few }), null)
})

test('barbell warm-ups only use loadable weights', () => {
  const w = warmupSets(100, 2.5, 20, few)
  assert.deepEqual(w.map(s => s.load), [20, 60, 70])
})

// ── Warm-ups: who gets one, and how big ──
const EX = {
  squat: { id: 'squat', logType: 'weight', equipment: ['barbell', 'squat rack'], primary: ['quads', 'glutes'], secondary: ['adductors', 'lower_back'] },
  legPress: { id: 'lp', logType: 'weight', equipment: ['machine'], primary: ['quads', 'glutes'], secondary: [] },
  pullUp: { id: 'pu', logType: 'bodyweight', equipment: ['pull-up bar'], primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_delts'] },
  dbRow: { id: 'row', logType: 'weight', equipment: ['dumbbell', 'bench'], primary: ['upper_back', 'lats'], secondary: ['biceps', 'rear_delts'] },
  oneArmRow: { id: 'row1', logType: 'weight', equipment: ['dumbbell'], primary: ['lats', 'upper_back'], secondary: ['biceps'] },
  dbPress: { id: 'dbp', logType: 'weight', equipment: ['dumbbell'], primary: ['chest', 'front_delts'], secondary: ['triceps'] },
  curl: { id: 'curl', logType: 'weight', equipment: ['ez bar'], primary: ['biceps'], secondary: [] },
  plank: { id: 'plank', logType: 'time', primary: ['abs'], secondary: [] }
}
const rr = (lo, hi) => ({ repRange: [lo, hi], sets: 3 })

test('warm-up: first lift for a muscle gets one, sized by how heavy', () => {
  assert.equal(warmupKind({ exercise: EX.squat, item: rr(8, 12) }), 'full') // barbell compound
  assert.equal(warmupKind({ exercise: EX.dbPress, item: rr(4, 6) }), 'full') // heavy dumbbells
  assert.equal(warmupKind({ exercise: EX.dbPress, item: rr(8, 12) }), 'light')
  assert.equal(warmupKind({ exercise: EX.dbPress, item: rr(15, 20) }), null) // high reps
  assert.equal(warmupKind({ exercise: EX.curl, item: rr(8, 12) }), null) // isolation
  assert.equal(warmupKind({ exercise: EX.plank, item: rr(8, 12) }), null)
  assert.equal(warmupKind({ exercise: { logType: 'weight', equipment: ['cable'], primary: ['abs', 'obliques'] }, item: rr(10, 12) }), null) // Pallof press
})

test('warm-up: muscles already worked with weight need none; bodyweight-warmed ones get a feeler', () => {
  assert.equal(warmupKind({ exercise: EX.legPress, item: rr(8, 12), before: [{ exercise: EX.squat, weighted: true }] }), null)
  // Day C: pull-ups, then the first weighted row, then another row
  const afterPullUps = [{ exercise: EX.pullUp, weighted: false }]
  assert.equal(warmupKind({ exercise: EX.dbRow, item: rr(8, 12), before: afterPullUps }), 'feeler')
  assert.equal(warmupKind({ exercise: EX.oneArmRow, item: rr(8, 12), before: [...afterPullUps, { exercise: EX.dbRow, weighted: true }] }), null)
  // Weighted pull-ups count as weight
  assert.equal(warmupKind({ exercise: EX.dbRow, item: rr(8, 12), before: [{ exercise: EX.pullUp, weighted: true }] }), null)
  // A muscle the earlier work didn't touch still gets the full treatment
  assert.equal(warmupKind({ exercise: EX.dbPress, item: rr(8, 12), before: afterPullUps }), 'light')
  assert.equal(warmupSize(EX.curl, rr(8, 12)), 'light')
  assert.equal(warmupSize(EX.curl, rr(15, 20)), null)
})

test('warm-up sets: light ramp, feeler, dumbbell floor, barbell fallback', () => {
  assert.deepEqual(warmupSets(14, 2, 0, null, 'light').map(s => [s.load, s.reps]), [[8, 6], [10, 4]])
  assert.deepEqual(warmupSets(14, 2, 0, null, 'feeler').map(s => [s.load, s.reps]), [[8, 6]])
  assert.deepEqual(warmupSets(30, 2, 0, null, 'full').map(s => [s.load, s.reps]), [[12, 8], [18, 5], [24, 3]])
  assert.deepEqual(warmupSets(3, 2, 0, null, 'feeler'), []) // under the lightest dumbbell
  // A light barbell lift: the bar itself
  assert.deepEqual(warmupSets(30, 2.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25], 'feeler').map(s => s.load), [20])
  assert.deepEqual(warmupSets(100, 2.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25], 'light').map(s => s.load), [50, 75])
})
