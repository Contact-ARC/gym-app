// Personal goals and powerlifting numbers. Pure functions, tested in test/goals.test.js.
//
// goal: { id, type, target, unit, exerciseId?, reps?, basis?, start, createdAt, by?, pinned, doneAt? }
//   lift        reach a weight on an exercise (basis 'e1rm' = estimated max, 'actual' = lift it for `reps`)
//   reps        reps in one set (pull-ups, push-ups)
//   time        seconds in one set (plank, carry)
//   bwMultiple  a lift as a multiple of your bodyweight
//   total       powerlifting total (squat + bench + deadlift)
//   dots        DOTS score
//   weight      bodyweight (7-day average)
//   bodyFat     body fat %
//   waist       waist measurement
//   leanMass    weight without fat
//   weekly      workouts per week (ongoing, also sets what keeps your streak going)
import { bestE1RM, convertLoad, isWorkSet, bestSeconds, roundToIncrement, loadForReps } from './training.js'
import { finished, weekStart, addDays, sessionsBetween } from './stats.js'
import { avgWeight, latestBodyFat, latestMeasure, leanMass, dots, fromCm, toCm } from './body.js'

export const GOAL_TYPES = ['lift', 'reps', 'time', 'bwMultiple', 'total', 'dots', 'weight', 'bodyFat', 'waist', 'leanMass', 'weekly']
export const BODY_GOALS = ['weight', 'bodyFat', 'waist', 'leanMass']
export const EXERCISE_GOALS = ['lift', 'reps', 'time', 'bwMultiple']
export const DEFAULT_LIFTS = { squat: 'barbell-back-squat', bench: 'barbell-bench-press', deadlift: 'barbell-deadlift' }

const r1 = (x) => Math.round(x * 10) / 10
const r2 = (x) => Math.round(x * 100) / 100

/** Work sets of one exercise, optionally only since a date. */
export function exerciseSets (sessions, exerciseId, since = null) {
  const out = []
  for (const s of finished(sessions)) {
    if (since && new Date(s.startedAt) < since) continue
    for (const x of s.sets || []) if (x.exerciseId === exerciseId && isWorkSet(x)) out.push({ ...x, date: s.startedAt })
  }
  return out
}

/**
 * Best on a lift, in `unit`.
 * basis 'e1rm': best estimated one-rep max. 'actual': heaviest weight lifted for at least `reps` reps.
 */
export function liftBest (sessions, exerciseId, { basis = 'e1rm', unit = 'kg', reps = 1, since = null } = {}) {
  const sets = exerciseSets(sessions, exerciseId, since).filter(s => s.unit !== 'pin')
  if (basis === 'e1rm') return bestE1RM(sets, unit) || null
  let best = 0
  for (const s of sets) if ((s.reps || 0) >= reps && s.load > 0) best = Math.max(best, convertLoad(s.load, s.unit, unit))
  return best ? r2(best) : null
}

export function bestReps (sessions, exerciseId) {
  return Math.max(0, ...exerciseSets(sessions, exerciseId).map(s => s.reps || 0)) || null
}

/** Powerlifting total from your best squat, bench and deadlift (last 12 weeks by default). */
export function plTotal (sessions, lifts = DEFAULT_LIFTS, { basis = 'e1rm', unit = 'kg', today = new Date(), weeks = 12 } = {}) {
  const since = weeks ? addDays(today, -7 * weeks) : null
  const out = { complete: true, total: 0 }
  for (const k of ['squat', 'bench', 'deadlift']) {
    const v = lifts?.[k] ? liftBest(sessions, lifts[k], { basis, unit, since }) : null
    out[k] = v
    if (v) out.total += v
    else out.complete = false
  }
  out.total = r2(out.total)
  return out
}

/** Your bodyweight for formulas: 7-day average of weigh-ins, or the profile's bodyweight. */
export function bodyweight (ctx, unit) {
  const w = avgWeight(ctx.entries, unit)
  if (w) return w
  const p = ctx.profile
  return p?.bodyweight ? convertLoad(p.bodyweight, p.unit, unit) : null
}

const mUnitOf = (profile) => (profile?.unit === 'lb' ? 'in' : 'cm')

/** Goal direction: up (more is better) or down. Weight and waist follow start → target. */
export function direction (goal) {
  if (goal.type === 'bodyFat') return 'down'
  if (goal.type === 'weight' || goal.type === 'waist') return goal.start != null && goal.target < goal.start ? 'down' : 'up'
  return 'up'
}

/** The unit a goal's numbers are shown in now (follows the app's units). */
export function displayUnit (goal, profile) {
  if (['lift', 'total', 'weight', 'leanMass'].includes(goal.type)) return profile?.unit || 'kg'
  if (goal.type === 'waist') return mUnitOf(profile)
  return goal.unit || null
}

/** A stored number (in goal.unit) in the display unit. */
export function inDisplay (goal, value, profile) {
  if (value == null) return null
  const to = displayUnit(goal, profile)
  if (goal.type === 'waist') return r1(fromCm(toCm(value, goal.unit || 'cm'), to))
  if (['lift', 'total', 'weight', 'leanMass'].includes(goal.type)) return r1(convertLoad(value, goal.unit || to, to))
  return value
}

/**
 * Where you are now, in the display unit.
 * ctx: { sessions, entries, profile, lifts, plBasis, today }
 */
export function currentValue (goal, ctx) {
  const unit = ctx.profile?.unit || 'kg'
  const today = ctx.today || new Date()
  switch (goal.type) {
    case 'lift': return liftBest(ctx.sessions, goal.exerciseId, { basis: goal.basis, unit, reps: goal.reps || 1 })
    case 'reps': return bestReps(ctx.sessions, goal.exerciseId)
    case 'time': return bestSeconds(exerciseSets(ctx.sessions, goal.exerciseId)) || null
    case 'bwMultiple': {
      const lift = liftBest(ctx.sessions, goal.exerciseId, { basis: goal.basis, unit: 'kg', reps: goal.reps || 1 })
      const bw = bodyweight(ctx, 'kg')
      return lift && bw ? r2(lift / bw) : null
    }
    case 'total': {
      const t = plTotal(ctx.sessions, ctx.lifts, { basis: goal.basis || ctx.plBasis, unit, today })
      return t.complete ? t.total : null
    }
    case 'dots': {
      const t = plTotal(ctx.sessions, ctx.lifts, { basis: goal.basis || ctx.plBasis, unit: 'kg', today })
      return t.complete ? dots(t.total, bodyweight(ctx, 'kg'), ctx.profile?.sex) : null
    }
    case 'weight': return avgWeight(ctx.entries, unit)
    case 'bodyFat': return latestBodyFat(ctx.entries, ctx.profile)?.value ?? null
    case 'waist': return latestMeasure(ctx.entries, 'waist', mUnitOf(ctx.profile))
    case 'leanMass': {
      const bf = latestBodyFat(ctx.entries, ctx.profile)
      return bf ? leanMass(avgWeight(ctx.entries, unit), bf.value) : null
    }
    case 'weekly': {
      const wk = weekStart(today)
      return sessionsBetween(ctx.sessions, wk, addDays(wk, 7)).length
    }
  }
  return null
}

/**
 * @returns {{ current, start, target, unit, pct, done, direction, ongoing }}
 */
export function goalProgress (goal, ctx) {
  const unit = displayUnit(goal, ctx.profile)
  const current = currentValue(goal, ctx)
  const target = inDisplay(goal, goal.target, ctx.profile)
  const start = inDisplay(goal, goal.start, ctx.profile)
  const dir = direction(goal)
  const ongoing = goal.type === 'weekly'
  let pct = 0
  if (current != null && target != null) {
    if (dir === 'up') {
      const from = start != null && start < target ? start : 0
      pct = target > from ? (current - from) / (target - from) : 1
    } else {
      const from = start != null && start > target ? start : null
      pct = from != null ? (from - current) / (from - target) : (current <= target ? 1 : 0)
    }
  }
  pct = Math.max(0, Math.min(1, pct))
  const done = current != null && target != null && (dir === 'up' ? current >= target - 1e-9 : current <= target + 1e-9)
  return { current, start, target, unit, pct, done, direction: dir, ongoing }
}

/** Weekly workouts target from an active "workouts per week" goal (it also decides the streak). */
export function weeklyTarget (goals) {
  const g = (goals || []).find(x => x.type === 'weekly' && !x.archived)
  return g ? Math.max(1, Math.round(g.target)) : null
}

/**
 * Realistic targets to offer when you set a goal (you always pick the number).
 * @returns {{ current, options: number[], basis: string }|null}
 */
export function suggestTargets (draft, ctx) {
  const unit = ctx.profile?.unit || 'kg'
  const inc = unit === 'kg' ? 2.5 : 5
  const beginner = ctx.profile?.level === 'beginner'
  const cur = currentValue(draft, ctx)
  const up = (x, step) => roundToIncrement(Math.ceil(x / step) * step, step)
  switch (draft.type) {
    case 'lift': {
      if (draft.basis === 'actual') {
        // What you could lift for those reps today, from your best estimated max
        const e = liftBest(ctx.sessions, draft.exerciseId, { basis: 'e1rm', unit })
        if (!e) return null
        const now = loadForReps(e, draft.reps || 1)
        const lo = beginner ? 1.08 : 1.03; const hi = beginner ? 1.15 : 1.08
        return { current: cur, options: [up(now * lo, inc), up(now * hi, inc)], basis: '3months' }
      }
      if (!cur) return null
      const lo = beginner ? 1.08 : 1.03; const hi = beginner ? 1.15 : 1.08
      return { current: cur, options: [up(cur * lo, inc), up(cur * hi, inc)], basis: '3months' }
    }
    case 'reps': return cur ? { current: cur, options: [cur + 2, cur + 4], basis: '3months' } : null
    case 'time': return cur ? { current: cur, options: [cur + 15, cur + 30], basis: '3months' } : null
    case 'bwMultiple': return cur ? { current: cur, options: [Math.ceil((cur + 0.01) * 4) / 4, Math.ceil((cur + 0.26) * 4) / 4], basis: 'next' } : null
    case 'total': return cur ? { current: cur, options: [up(cur * 1.03, inc), up(cur * 1.07, inc)], basis: '3months' } : null
    case 'dots': return cur ? { current: cur, options: [Math.ceil(cur / 10) * 10 + 10, Math.ceil(cur / 10) * 10 + 25], basis: '3months' } : null
    case 'bodyFat': {
      if (cur == null) return null
      const floor = ctx.profile?.sex === 'female' ? 18 : 10
      const opts = [r1(cur - 2), r1(cur - 4)].filter(v => v >= floor)
      return opts.length ? { current: cur, options: opts, basis: '3months' } : { current: cur, options: [], basis: 'lean' }
    }
    case 'weekly': {
      const today = ctx.today || new Date()
      const wk = weekStart(today)
      const n = sessionsBetween(ctx.sessions, addDays(wk, -28), wk).length
      const avg = Math.round(n / 4)
      return { current: avg, options: [Math.max(2, avg), Math.max(3, avg + 1)].filter((v, i, a) => a.indexOf(v) === i), basis: 'average' }
    }
    case 'weight': case 'waist': case 'leanMass':
      return cur != null ? { current: cur, options: [], basis: 'none' } : null
  }
  return null
}

/** Weeks to go at the current rate (body goals), or null when you're not heading that way. */
export function weeksToGo (current, target, perWeek) {
  if (current == null || target == null || !perWeek) return null
  const gap = target - current
  if (gap === 0) return 0
  if (Math.sign(gap) !== Math.sign(perWeek)) return null
  const w = gap / perWeek
  return w > 520 ? null : Math.ceil(w)
}
