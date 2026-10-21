// Progress and motivation numbers: streaks, monthly reports, calendar, muscle volume, challenges.
// Pure functions (no Vue, no Capacitor) so they're unit-tested in test/stats.test.js.
import { dateKey, isWorkSet, sessionVolume, setsPerMuscle, detectPRs, bestE1RM, heaviest, convertLoad } from './training.js'

/** Workouts per week that keep a streak going. */
export const STREAK_MIN = 2

const DAY = 86400000

/** Monday 00:00 of the week containing `d`. */
export function weekStart (d = new Date()) {
  const x = new Date(typeof d === 'string' ? new Date(d) : d)
  x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7 // Mon = 0
  x.setDate(x.getDate() - dow)
  return x
}

export const weekKey = (d) => dateKey(weekStart(d))
export const monthKey = (d) => dateKey(d).slice(0, 7)

/** Add whole days without DST surprises. */
export function addDays (d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Finished sessions only, oldest first. */
export function finished (sessions) {
  return (sessions || []).filter(s => s.finishedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

/**
 * Week streak: consecutive Mon–Sun weeks with at least `min` workouts.
 * This week only adds to the streak once it's reached the minimum; until then the streak
 * from previous weeks is still alive (you have until Sunday).
 * `min` can be a function of the week (YYYY-MM-DD of its Monday), so a weekly goal only counts from the week it was set.
 * @returns {{ weeks:number, thisWeek:number, min:number, safe:boolean, best:number }}
 */
export function weekStreak (sessions, today = new Date(), min = STREAK_MIN) {
  const minOf = typeof min === 'function' ? min : () => min
  const counts = {}
  for (const s of finished(sessions)) {
    const k = weekKey(s.startedAt)
    counts[k] = (counts[k] || 0) + 1
  }
  const thisKey = weekKey(today)
  const thisWeek = counts[thisKey] || 0
  const thisMin = minOf(thisKey)
  let weeks = 0
  let w = weekStart(today)
  if (thisWeek >= thisMin) weeks = 1
  w = addDays(w, -7)
  while ((counts[dateKey(w)] || 0) >= minOf(dateKey(w))) { weeks++; w = addDays(w, -7) }

  // Best ever, for the report and the crew board
  let best = 0; let run = 0; let prev = null
  for (const k of Object.keys(counts).sort()) {
    if (counts[k] < minOf(k)) { run = 0; prev = k; continue }
    run = prev && dateKey(addDays(new Date(prev + 'T00:00:00'), 7)) === k && run > 0 ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }
  return { weeks, thisWeek, min: thisMin, safe: thisWeek >= thisMin, best: Math.max(best, weeks) }
}

/** Sessions that started inside [from, to). */
export function sessionsBetween (sessions, from, to) {
  const a = from.getTime(); const b = to.getTime()
  return finished(sessions).filter(s => { const t = new Date(s.startedAt).getTime(); return t >= a && t < b })
}

export function sessionsInMonth (sessions, month) {
  return finished(sessions).filter(s => monthKey(s.startedAt) === month)
}

export function workSets (session) {
  return (session.sets || []).filter(s => isWorkSet(s) && (s.reps || s.seconds))
}

/** Minutes between start and finish (capped at 4 h to ignore sessions left open overnight). */
export function sessionMinutes (s) {
  if (!s.finishedAt) return 0
  const exact = (new Date(s.finishedAt) - new Date(s.startedAt)) / 60000
  if (exact < 1) return Math.max(0, Math.round(exact * 100) / 100) // shows as "<1"
  return Math.min(Math.round(exact), 240)
}

/**
 * Hard sets per muscle per week, with a status against the target range.
 * @param {number} weeks  1 = the given week only, 4 = average over 4 weeks ending with it
 * @returns {{ muscle:string, sets:number, status:'low'|'ok'|'high' }[]} most sets first
 */
export function muscleVolume (sessions, exercisesById, { today = new Date(), weeks = 1, target = [10, 20] } = {}) {
  const end = addDays(weekStart(today), 7)
  const start = addDays(end, -7 * weeks)
  const counts = setsPerMuscle(sessionsBetween(sessions, start, end), exercisesById)
  return Object.entries(counts)
    .map(([muscle, n]) => {
      const sets = Math.round((n / weeks) * 2) / 2
      return { muscle, sets, status: sets < target[0] ? 'low' : sets > target[1] ? 'high' : 'ok' }
    })
    .sort((a, b) => b.sets - a.sets)
}

/**
 * Month calendar, Monday first. Each cell: { key, day, inMonth, today, sessions }.
 */
export function calendarMonth (month, sessions, today = new Date()) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = weekStart(first)
  const byDay = {}
  for (const s of finished(sessions)) (byDay[dateKey(s.startedAt)] ||= []).push(s)
  const todayKey = dateKey(today)
  const weeks = []
  let d = start
  do {
    const row = []
    for (let i = 0; i < 7; i++) {
      const key = dateKey(d)
      row.push({ key, day: d.getDate(), inMonth: d.getMonth() === m - 1, today: key === todayKey, sessions: byDay[key] || [] })
      d = addDays(d, 1)
    }
    weeks.push(row)
  } while (d.getMonth() === m - 1)
  return weeks
}

export function shiftMonth (month, n) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return dateKey(d).slice(0, 7)
}

/**
 * Everything for the month-end report.
 * @returns {{ month, sessions, days, minutes, sets, volume, unit, prs, prCount, muscles, lifts, prevSessions, bestStreak }}
 */
export function monthReport (allSessions, month, { unit = 'kg', exercisesById = {} } = {}) {
  const all = finished(allSessions)
  const mine = all.filter(s => monthKey(s.startedAt) === month)
  const prevMonth = shiftMonth(month, -1)
  const prevSessions = all.filter(s => monthKey(s.startedAt) === prevMonth).length

  // PRs in order, each session compared with everything before it; keep the best per exercise + type
  const prMap = {}
  for (const s of mine) {
    const before = all.filter(x => x.startedAt < s.startedAt)
    for (const pr of detectPRs(s, before, unit)) {
      const k = pr.exerciseId + ':' + pr.type
      if (!prMap[k] || pr.value > prMap[k].value || pr.type === 'reps') prMap[k] = { ...pr, date: s.startedAt }
    }
  }
  const prs = Object.values(prMap)

  // Biggest strength gains this month: first vs last session's best estimated max
  const byEx = {}
  for (const s of mine) {
    for (const id of new Set(workSets(s).map(x => x.exerciseId))) {
      const pin = s.sets.find(x => x.exerciseId === id)?.unit === 'pin'
      const mine = s.sets.filter(x => x.exerciseId === id)
      const e = pin ? heaviest(mine, unit) : bestE1RM(mine, unit)
      if (e > 0) (byEx[id] ||= { pin, points: [] }).points.push(e)
    }
  }
  const lifts = Object.entries(byEx)
    .filter(([, v]) => v.points.length >= 2)
    .map(([id, v]) => {
      const from = v.points[0]; const to = Math.max(...v.points.slice(1))
      return { exerciseId: id, from, to, change: to - from, pct: from ? (to - from) / from : 0, unit: v.pin ? 'pin' : unit }
    })
    .filter(l => l.change > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)

  const muscles = Object.entries(setsPerMuscle(mine, exercisesById))
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets)

  // Best streak reached by the end of this month
  const [y, m] = month.split('-').map(Number)
  const monthEnd = new Date(y, m, 0, 12)
  const upToMonth = all.filter(s => monthKey(s.startedAt) <= month)

  return {
    month,
    sessions: mine.length,
    days: new Set(mine.map(s => dateKey(s.startedAt))).size,
    minutes: mine.reduce((t, s) => t + sessionMinutes(s), 0),
    sets: mine.reduce((t, s) => t + workSets(s).length, 0),
    volume: Math.round(mine.reduce((t, s) => t + sessionVolume(s, unit), 0)),
    unit,
    prs,
    prCount: new Set(prs.map(p => p.exerciseId)).size, // exercises with a record, not record types
    muscles,
    lifts,
    prevSessions,
    bestStreak: weekStreak(upToMonth, monthEnd).best
  }
}

/** Months (YYYY-MM) that have at least one finished workout, newest first. */
export function monthsWithWorkouts (sessions) {
  return [...new Set(finished(sessions).map(s => monthKey(s.startedAt)))].sort().reverse()
}

/**
 * Progress on the routine's monthly challenge.
 * challenge: { type: 'workouts'|'sets'|'volume'|'reps'|'time'|'manual', target, exerciseIds?, unit? }
 * @returns {{ value:number, target:number, pct:number, done:boolean }}
 */
export function challengeProgress (challenge, sessions, month, { unit = 'kg', manual = 0 } = {}) {
  if (!challenge) return null
  const mine = sessionsInMonth(sessions, month)
  const ids = challenge.exerciseIds?.length ? new Set(challenge.exerciseIds) : null
  const pick = (s) => workSets(s).filter(x => !ids || ids.has(x.exerciseId))
  let value = 0
  let target = challenge.target || 1
  switch (challenge.type) {
    case 'workouts': value = mine.length; break
    case 'sets': value = mine.reduce((t, s) => t + pick(s).length, 0); break
    case 'reps': value = mine.reduce((t, s) => t + pick(s).reduce((r, x) => r + (x.reps || 0), 0), 0); break
    case 'time': value = mine.reduce((t, s) => t + pick(s).reduce((r, x) => r + (x.seconds || 0), 0), 0); break
    case 'volume': {
      value = Math.round(mine.reduce((t, s) => t + sessionVolume({ sets: pick(s) }, unit), 0))
      if (challenge.unit && challenge.unit !== unit) target = Math.round(convertLoad(target, challenge.unit, unit))
      break
    }
    case 'manual': value = manual || 0; break
    default: value = 0
  }
  return { value, target, pct: Math.min(1, value / target), done: value >= target }
}
