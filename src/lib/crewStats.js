// What a phone tells the crew about itself: totals per week / month / all time, powerlifting numbers,
// weekly lift lines for head-to-heads, and badges. Pure functions over your sessions (tested in
// test/crewStats.test.js); crew.js puts them together and sends them.
import { finished, weekStart, weekKey, monthKey, addDays, workSets } from './stats.js'
import { sessionVolume, bestE1RM, heaviest, bestSeconds, isWorkSet, convertLoad } from './training.js'
import { liftBest } from './goals.js'

const r0 = (x) => Math.round(x)
const LIFTS = ['squat', 'bench', 'deadlift']

/**
 * Records per workout: an exercise counts once per workout when it beat your best estimated max,
 * heaviest set or longest hold so far (the first time you do an exercise sets the baseline).
 * @returns {{ [sessionId]: number }}
 */
export function recordsBySession (sessions, unit) {
  const best = {}
  const out = {}
  for (const s of finished(sessions)) {
    let n = 0
    const next = {}
    for (const id of new Set((s.sets || []).map(x => x.exerciseId))) {
      const mine = s.sets.filter(x => x.exerciseId === id && isWorkSet(x))
      if (!mine.length) continue
      const pin = mine.some(x => x.unit === 'pin')
      const e = pin ? 0 : bestE1RM(mine, unit)
      const h = heaviest(mine, unit)
      const t = bestSeconds(mine)
      const b = best[id]
      if (b && ((e > b.e && b.e > 0) || (h > b.h && b.h > 0) || (t > b.t && b.t > 0))) n++
      next[id] = { e: Math.max(b?.e || 0, e), h: Math.max(b?.h || 0, h), t: Math.max(b?.t || 0, t) }
    }
    Object.assign(best, next)
    out[s.id] = n
  }
  return out
}

/** Workouts, sets, volume and records for a list of finished workouts. */
export function totals (list, unit, records = {}) {
  return {
    workouts: list.length,
    sets: list.reduce((n, s) => n + workSets(s).length, 0),
    volume: r0(list.reduce((n, s) => n + sessionVolume(s, unit), 0)),
    records: list.reduce((n, s) => n + (records[s.id] || 0), 0),
    unit
  }
}

/** This week, last week, this month, last month and all time. */
export function periodStats (sessions, unit, today = new Date()) {
  const all = finished(sessions)
  const recs = recordsBySession(sessions, unit)
  const wk = weekStart(today)
  const inRange = (from, to) => all.filter(s => { const t = new Date(s.startedAt); return t >= from && t < to })
  const month = monthKey(today)
  const prevMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 15))
  return {
    week: { key: weekKey(today), ...totals(inRange(wk, addDays(wk, 7)), unit, recs) },
    lastWeek: { key: weekKey(addDays(wk, -7)), ...totals(inRange(addDays(wk, -7), wk), unit, recs) },
    month: { key: month, ...totals(all.filter(s => monthKey(s.startedAt) === month), unit, recs) },
    lastMonth: { key: prevMonth, ...totals(all.filter(s => monthKey(s.startedAt) === prevMonth), unit, recs) },
    all: { ...totals(all, unit, recs), since: all[0]?.startedAt?.slice(0, 10) || null }
  }
}

/**
 * Squat, bench and deadlift: best estimated max and heaviest actually lifted (last 12 weeks, like the
 * Progress card), plus totals when all three are there.
 */
export function liftNumbers (sessions, lifts, unit, today = new Date()) {
  const since = addDays(today, -84)
  const out = { unit, e1rm: {}, actual: {} }
  for (const basis of ['e1rm', 'actual']) {
    let total = 0
    let complete = true
    for (const k of LIFTS) {
      const v = lifts?.[k] ? liftBest(sessions, lifts[k], { basis, unit, since }) : null
      out[basis][k] = v ? r0(v * 10) / 10 : null
      if (v) total += v
      else complete = false
    }
    out[basis].total = complete ? r0(total * 10) / 10 : null
  }
  return out
}

/** Best estimated max per week for each lift over the last `weeks` weeks: { squat: [[weekKey, value], …] } */
export function liftLines (sessions, lifts, unit, today = new Date(), weeks = 26) {
  const from = addDays(weekStart(today), -7 * (weeks - 1))
  const list = finished(sessions).filter(s => new Date(s.startedAt) >= from)
  const out = {}
  for (const k of LIFTS) {
    const id = lifts?.[k]
    if (!id) continue
    const byWeek = {}
    for (const s of list) {
      const e = bestE1RM((s.sets || []).filter(x => x.exerciseId === id && x.unit !== 'pin'), unit)
      if (!e) continue
      const wk = weekKey(s.startedAt)
      byWeek[wk] = Math.max(byWeek[wk] || 0, e)
    }
    const pts = Object.keys(byWeek).sort().map(wk => [wk, r0(byWeek[wk] * 10) / 10])
    if (pts.length) out[k] = pts
  }
  return out
}

// ── Badges ─────────────────────────────────────────────────
// Plates: a standard plate each side of a standard bar (20 kg / 45 lb)
export const PLATE_STEPS = { kg: [60, 100, 140, 180, 220], lb: [135, 225, 315, 405, 495] }
export const TOTAL_CLUBS_KG = [300, 400, 500, 600, 700]
const WORKOUTS = [1, 10, 25, 50, 100, 250, 500]
const STREAKS = [4, 10, 26, 52]
const RECORDS = [10, 50, 100, 250]

/** Every badge you've earned, as ids: w10 (10 workouts), s4 (4-week streak), r50 (50 records), bench-2p, t400 … */
export function badgeIds ({ sessions, unit = 'kg', lifts, bestStreak = 0, records = 0 }) {
  const ids = []
  const n = finished(sessions).length
  for (const w of WORKOUTS) if (n >= w) ids.push('w' + w)
  for (const s of STREAKS) if (bestStreak >= s) ids.push('s' + s)
  for (const r of RECORDS) if (records >= r) ids.push('r' + r)
  let totalKg = 0
  let complete = true
  const steps = PLATE_STEPS[unit] || PLATE_STEPS.kg
  for (const k of LIFTS) {
    const best = lifts?.[k] ? liftBest(sessions, lifts[k], { basis: 'actual', unit, reps: 1 }) : null
    if (!best) { complete = false; continue }
    steps.forEach((thr, i) => { if (best >= thr - 0.01) ids.push(`${k}-${i + 1}p`) })
    totalKg += convertLoad(best, unit, 'kg')
  }
  if (complete) for (const c of TOTAL_CLUBS_KG) if (totalKg >= c - 0.01) ids.push('t' + c)
  return ids
}

const LIFT_NAMES = {
  en: { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' },
  es: { squat: 'Sentadilla', bench: 'Press banca', deadlift: 'Peso muerto' }
}

/** A badge's title in English or Spanish, e.g. "Bench: 2 plates (100 kg)". */
export function badgeTitle (id, lang = 'en', unit = 'kg') {
  const es = lang === 'es'
  let m
  if ((m = /^w(\d+)$/.exec(id))) {
    const n = +m[1]
    return n === 1 ? (es ? 'Primer entrenamiento' : 'First workout') : (es ? `${n} entrenamientos` : `${n} workouts`)
  }
  if ((m = /^s(\d+)$/.exec(id))) return es ? `Racha de ${m[1]} semanas` : `${m[1]}-week streak`
  if ((m = /^r(\d+)$/.exec(id))) return es ? `${m[1]} récords` : `${m[1]} records`
  if ((m = /^t(\d+)$/.exec(id))) return es ? `Total de ${m[1]} kg` : `${m[1]} kg total`
  if ((m = /^(squat|bench|deadlift)-(\d)p$/.exec(id))) {
    const n = +m[2]
    const w = (PLATE_STEPS[unit] || PLATE_STEPS.kg)[n - 1]
    const lift = LIFT_NAMES[es ? 'es' : 'en'][m[1]]
    return es ? `${lift}: ${n} ${n === 1 ? 'disco' : 'discos'} (${w} ${unit})` : `${lift}: ${n} ${n === 1 ? 'plate' : 'plates'} (${w} ${unit})`
  }
  return id
}

/** Which kind of badge, for its icon. */
export function badgeKind (id) {
  if (/^w/.test(id)) return 'workouts'
  if (/^s\d/.test(id)) return 'streak'
  if (/^r/.test(id)) return 'records'
  if (/^t/.test(id)) return 'total'
  return 'plates'
}

/** Badges in a sensible order for a profile: workouts, streaks, records, lifts, totals. */
export function sortBadges (ids) {
  const order = { workouts: 0, streak: 1, records: 2, plates: 3, total: 4 }
  const num = (id) => +(/(\d+)/.exec(id)?.[1] || 0)
  return [...ids].sort((a, b) => order[badgeKind(a)] - order[badgeKind(b)] || a.localeCompare(b, undefined, { numeric: true }) || num(a) - num(b))
}
