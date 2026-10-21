import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navyBodyFat, bmi, leanMass, ffmi, dots, avgWeight, weightRate, bodyFatOf, latestBodyFat, latestMeasure, toCm } from '../src/lib/body.js'
import {
  liftBest, plTotal, goalProgress, suggestTargets, weeksToGo, weeklyTarget, currentValue, direction
} from '../src/lib/goals.js'

test('Navy body fat: published examples', () => {
  // Man 180 cm, waist 85, neck 38 → about 16.5 %
  const m = navyBodyFat({ sex: 'male', heightCm: 180, waistCm: 85, neckCm: 38 })
  assert.ok(m > 15.5 && m < 17.5, String(m))
  // Woman 165 cm, waist 70, hips 95, neck 32 → about 24 %
  const f = navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 70, neckCm: 32, hipsCm: 95 })
  assert.ok(f > 22 && f < 27, String(f))
  assert.equal(navyBodyFat({ sex: 'male', heightCm: 180, waistCm: 85 }), null) // no neck
  assert.equal(navyBodyFat({ heightCm: 180, waistCm: 85, neckCm: 38 }), null) // no sex
  assert.equal(navyBodyFat({ sex: 'female', heightCm: 165, waistCm: 70, neckCm: 32 }), null) // no hips
})

test('BMI, lean mass, FFMI', () => {
  assert.equal(bmi(80, 180), 24.7)
  assert.equal(leanMass(100, 20), 80)
  const f = ffmi(100, 20, 180)
  assert.equal(f.ffmi, 24.7); assert.equal(f.normalized, 24.7)
  assert.equal(ffmi(100, null, 180), null)
})

test('DOTS', () => {
  // 600 kg total at 90 kg bodyweight, men → about 395
  const d = dots(600, 90, 'male')
  assert.ok(d > 385 && d < 405, String(d))
  assert.ok(dots(400, 60, 'female') > 430)
  assert.equal(dots(600, 90, null), null)
  assert.equal(dots(600, 250, 'male'), dots(600, 210, 'male')) // bodyweight capped
})

const e = (date, weight, extra = {}) => ({ id: date, date, weight, unit: 'kg', mUnit: 'cm', ...extra })

test('weight: 7-day average and weekly rate', () => {
  const entries = [e('2026-10-01', 90), e('2026-10-08', 89.5), e('2026-10-15', 89), e('2026-10-22', 88.5), e('2026-10-23', 88.3), e('2026-10-24', 88.6)]
  assert.equal(avgWeight(entries, 'kg'), 88.5)
  const r = weightRate(entries, 'kg')
  assert.ok(r.perWeek < -0.4 && r.perWeek > -0.6, String(r.perWeek))
  assert.equal(weightRate(entries.slice(0, 2), 'kg'), null)
  assert.ok(Math.abs(avgWeight(entries, 'lb') - 195.1) < 0.2)
})

test('body fat: entered beats estimated; estimate uses your latest neck', () => {
  const profile = { sex: 'male', heightCm: 180 }
  const entries = [e('2026-10-01', 85, { neck: 38 }), e('2026-10-10', 84, { waist: 85 }), e('2026-10-20', 84, { waist: 84, bodyFat: 14 })]
  assert.equal(bodyFatOf(entries[1], entries, profile).source, 'estimated')
  assert.deepEqual(bodyFatOf(entries[2], entries, profile), { value: 14, source: 'entered' })
  assert.equal(latestBodyFat(entries, profile).value, 14)
  assert.equal(latestBodyFat(entries.slice(0, 2), { heightCm: 180 }), null) // no sex set → no estimate
  assert.equal(latestMeasure([e('2026-10-01', 80, { waist: 33, mUnit: 'in' })], 'waist', 'cm'), 83.8)
  assert.equal(toCm(10, 'in'), 25.4)
})

const at = (iso, sets) => ({ id: iso, startedAt: new Date(iso).toISOString(), finishedAt: new Date(new Date(iso).getTime() + 3600e3).toISOString(), sets })
const set = (exerciseId, load, reps) => ({ exerciseId, load, unit: 'kg', reps })
const sessions = [
  at('2026-10-05T18:00', [set('squat', 140, 5), set('bench', 100, 3), set('dl', 180, 3), set('pullup', 0, 9)]),
  at('2026-10-12T18:00', [set('squat', 150, 2), set('bench', 102.5, 1)])
]
const lifts = { squat: 'squat', bench: 'bench', deadlift: 'dl' }

test('lift bests: estimated vs actually lifted', () => {
  assert.ok(liftBest(sessions, 'squat', { basis: 'e1rm' }) > 155)
  assert.equal(liftBest(sessions, 'squat', { basis: 'actual' }), 150)
  assert.equal(liftBest(sessions, 'squat', { basis: 'actual', reps: 5 }), 140)
  assert.equal(liftBest(sessions, 'squat', { basis: 'actual', unit: 'lb' }), 330.69)
  const t = plTotal(sessions, lifts, { basis: 'actual', today: new Date(2026, 9, 20) })
  assert.deepEqual([t.squat, t.bench, t.deadlift, t.total, t.complete], [150, 102.5, 180, 432.5, true])
  assert.equal(plTotal(sessions, { ...lifts, deadlift: null }, { today: new Date(2026, 9, 20) }).complete, false)
})

const ctx = {
  sessions,
  entries: [e('2026-10-10', 90), e('2026-10-18', 89)],
  profile: { unit: 'kg', sex: 'male', heightCm: 180, level: 'standard' },
  lifts,
  plBasis: 'actual',
  today: new Date(2026, 9, 20)
}

test('goal progress: up goals from where you started', () => {
  const g = { type: 'lift', exerciseId: 'squat', basis: 'actual', reps: 1, target: 160, unit: 'kg', start: 140 }
  const p = goalProgress(g, ctx)
  assert.equal(p.current, 150); assert.equal(p.pct, 0.5); assert.equal(p.done, false)
  assert.equal(goalProgress({ ...g, target: 150 }, ctx).done, true)
  // Shown in pounds when the app is in pounds
  const lb = goalProgress(g, { ...ctx, profile: { ...ctx.profile, unit: 'lb' } })
  assert.equal(lb.unit, 'lb'); assert.equal(lb.target, 352.7)
})

test('goal progress: reps, bodyweight multiple, total, DOTS', () => {
  assert.equal(currentValue({ type: 'reps', exerciseId: 'pullup' }, ctx), 9)
  assert.equal(currentValue({ type: 'bwMultiple', exerciseId: 'squat', basis: 'actual' }, ctx), 1.69)
  assert.equal(currentValue({ type: 'total', basis: 'actual' }, ctx), 432.5)
  assert.ok(currentValue({ type: 'dots', basis: 'actual' }, ctx) > 280)
})

test('goal progress: weight down, body fat down', () => {
  const g = { type: 'weight', target: 85, unit: 'kg', start: 90 }
  assert.equal(direction(g), 'down')
  const p = goalProgress(g, ctx)
  assert.equal(p.current, 89); assert.equal(p.pct, 0.2)
  const bf = goalProgress({ type: 'bodyFat', target: 15, unit: '%', start: 20 }, { ...ctx, entries: [e('2026-10-18', 89, { bodyFat: 17 })] })
  assert.equal(bf.pct, 0.6)
})

test('suggested targets are modest and rounded to plates', () => {
  const s = suggestTargets({ type: 'lift', exerciseId: 'squat', basis: 'e1rm' }, ctx)
  assert.equal(s.options.length, 2)
  assert.ok(s.options.every(v => v % 2.5 === 0 && v > s.current && v < s.current * 1.12))
  assert.deepEqual(suggestTargets({ type: 'reps', exerciseId: 'pullup' }, ctx).options, [11, 13])
  assert.equal(suggestTargets({ type: 'lift', exerciseId: 'nothing', basis: 'e1rm' }, ctx), null)
})

test('weeks to go and weekly target', () => {
  assert.equal(weeksToGo(89, 85, -0.5), 8)
  assert.equal(weeksToGo(89, 85, 0.3), null)
  assert.equal(weeklyTarget([{ type: 'weekly', target: 4 }]), 4)
  assert.equal(weeklyTarget([]), null)
})
