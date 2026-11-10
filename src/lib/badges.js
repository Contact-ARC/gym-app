// Badges (0.10): what there is to earn, how far along you are and when you got each. Pure (no store),
// tested in test/badges.test.js.
//
// Two kinds:
//  - level: one badge that goes up through the tiers (Bronze → Diamond) as you pass its thresholds
//           (workouts, streak, plates on a lift…). Badges with a single threshold have no tiers.
//  - feat:  earned again and again (record day, early bird…), shown as ×N.
// Secret badges are shown as "???" until earned. Climbing ones only show once you've climbed.
//
// evaluateBadges() walks your workouts oldest first, so each level and each feat gets the date it
// was really earned, which is why your history fills the wall on day one.
import { finished, weekKey, STREAK_MIN } from './stats.js'
import { sessionVolume, isWorkSet, convertLoad } from './training.js'
import { recordsBySession, PLATE_STEPS, TOTAL_CLUBS_KG } from './crewStats.js'

export const TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond']
export const GROUPS = ['milestones', 'strength', 'habits', 'cardio', 'climbing', 'secret']
/** Lifts that count for the plates, total and bodyweight badges */
const LIFTS = ['squat', 'bench', 'deadlift']
const PULL_UPS = ['pull-up', 'chin-up']

const lvl = (id, group, icon, levels, extra = {}) => ({ id, group, icon, kind: 'level', levels, ...extra })
const feat = (id, group, icon, extra = {}) => ({ id, group, icon, kind: 'feat', ...extra })

/**
 * Every badge. `levels` is a list of thresholds, or a function of your unit (plates are 20 kg / 45 lb).
 * unit: what the numbers are in ('kg' converts to yours when shown; 'x' is a multiple of bodyweight).
 */
export const BADGES = [
  lvl('first', 'milestones', 'start', [1]),
  lvl('workouts', 'milestones', 'train', [10, 50, 100, 250, 500]),
  lvl('streak', 'milestones', 'fire', [4, 10, 26, 52, 104]),
  lvl('records', 'milestones', 'trophy', [10, 50, 100, 250, 500]),
  lvl('tonnage', 'milestones', 'weight', [10000, 100000, 500000, 1000000, 2500000], { unit: 'kg' }),
  lvl('variety', 'milestones', 'grid', [10, 25, 50, 75, 100]),
  lvl('squat', 'strength', 'lifter', (u) => PLATE_STEPS[u] || PLATE_STEPS.kg, { unit: 'own' }),
  lvl('bench', 'strength', 'lifter', (u) => PLATE_STEPS[u] || PLATE_STEPS.kg, { unit: 'own' }),
  lvl('deadlift', 'strength', 'lifter', (u) => PLATE_STEPS[u] || PLATE_STEPS.kg, { unit: 'own' }),
  lvl('total', 'strength', 'medal', TOTAL_CLUBS_KG, { unit: 'kg' }),
  lvl('benchBw', 'strength', 'scale', [0.75, 1, 1.25, 1.5, 2], { unit: 'x', needs: 'bw' }),
  lvl('squatBw', 'strength', 'scale', [1, 1.25, 1.5, 2, 2.5], { unit: 'x', needs: 'bw' }),
  lvl('deadliftBw', 'strength', 'scale', [1.25, 1.5, 2, 2.5, 3], { unit: 'x', needs: 'bw' }),
  lvl('pullups', 'strength', 'arm', [5, 10, 15, 20, 25]),
  feat('recordDay', 'habits', 'trophyAward'),
  feat('perfectWeek', 'habits', 'star'),
  feat('fullHouse', 'habits', 'checkAll'),
  feat('comeback', 'habits', 'restore'),
  feat('earlyBird', 'habits', 'sunrise'),
  feat('nightOwl', 'habits', 'night'),
  feat('weekend', 'habits', 'weekend'),
  feat('heavyDay', 'habits', 'weight'),
  feat('deloadWeek', 'habits', 'deload'),
  feat('challenge', 'habits', 'challenge'),
  feat('goal', 'habits', 'goal'),
  lvl('distance', 'cardio', 'run', [10, 50, 100, 250, 500]),
  feat('fiveK', 'cardio', 'shoe'),
  lvl('climbs', 'climbing', 'climb', [10, 50, 100, 250, 500], { needs: 'climb' }),
  feat('flashDay', 'climbing', 'flash', { needs: 'climb' }),
  feat('newYear', 'secret', 'party', { secret: true }),
  feat('christmas', 'secret', 'tree', { secret: true }),
  feat('witching', 'secret', 'moon', { secret: true }),
  feat('twoHours', 'secret', 'timerSand', { secret: true })
]
export const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]))
export const levelsOf = (b, unit = 'kg') => (typeof b.levels === 'function' ? b.levels(unit) : b.levels || [])

/** Thresholds (feats repeat, so they have none) */
export const FEAT_RULES = {
  recordDay: 3, // records in one workout
  comebackDays: 14,
  earlyBefore: 7, // started before 07:00
  nightFrom: 21, // started at 21:00 or later
  heavyKg: 10000, // lifted in one workout
  fiveKm: 5,
  twoHoursMin: 120,
  twoHoursMax: 300 // longer than that is a workout left running, not a two-hour session
}

const r2 = (x) => Math.round(x * 100) / 100
const dayOf = (iso) => String(iso).slice(0, 10)
const minutesOf = (s) => (s.finishedAt ? (new Date(s.finishedAt) - new Date(s.startedAt)) / 60000 : 0)

/**
 * Where you are on every badge.
 * @param {object} p
 * @param {Array} p.sessions all your workouts (unfinished ones are ignored)
 * @param {string} p.unit kg | lb
 * @param {object} p.lifts { squat, bench, deadlift }: exercise ids for the strength badges
 * @param {Array} p.bodyweights [{ date: 'YYYY-MM-DD', kg }] any order
 * @param {number} p.weekTarget workouts that make a perfect week (your days per week)
 * @param {Array} p.challengeDates dates you completed the monthly challenge
 * @param {Array} p.goalDates dates you reached a goal
 * @param {number|Function} p.streakMin workouts a week that keep a streak (or a function of the week key), as on Progress
 * @returns {{ [id]: { level, count, value, next, first, last, dates } }}
 *   level: tiers reached (level badges); count: times earned (feats; for level badges = level)
 *   value: where you are now (workouts done, best streak, heaviest bench in your unit, best ratio…)
 *   next: the next threshold (null at the top); dates: when each level was reached, or each feat earned
 */
export function evaluateBadges ({ sessions, unit = 'kg', lifts = {}, bodyweights = [], weekTarget = 3, challengeDates = [], goalDates = [], streakMin = STREAK_MIN }) {
  const list = finished(sessions)
  const records = recordsBySession(sessions, unit)
  const bws = [...bodyweights].filter(b => b?.kg > 0 && b.date).sort((a, b) => a.date.localeCompare(b.date))
  const bwAt = (date) => {
    let v = bws[0]?.kg || null // before your first weigh-in: the first one you logged
    for (const b of bws) { if (b.date <= date) v = b.kg; else break }
    return v
  }

  // Feats: dates; level badges: a running value checked against their thresholds
  const featDates = Object.fromEntries(BADGES.filter(b => b.kind === 'feat').map(b => [b.id, []]))
  const value = {}
  const levelDates = {}
  const bump = (id, v, date) => {
    if (v == null || !(v > (value[id] ?? -Infinity))) return
    value[id] = v
    const th = levelsOf(BADGE_BY_ID[id], unit)
    const got = levelDates[id] || (levelDates[id] = [])
    while (got.length < th.length && v >= th[got.length] - 1e-9) got.push(date)
  }

  let n = 0
  let recTotal = 0
  let tonnage = 0
  let km = 0
  let climbs = 0
  const seen = new Set()
  const best = {} // heaviest actually lifted per lift, in kg
  const weekCount = {}
  const perfect = new Set()
  const deloads = new Set()
  const weekendDays = {} // weekend key → { sat, sun }
  let prev = null
  // Streak: weeks with enough workouts, back to back
  const minOf = typeof streakMin === 'function' ? streakMin : () => streakMin
  let run = 0
  let lastWeek = null

  for (const s of list) {
    const date = dayOf(s.startedAt)
    const start = new Date(s.startedAt)
    const sets = (s.sets || []).filter(isWorkSet)
    n++
    bump('first', n, date)
    bump('workouts', n, date)

    // Records and record days
    const rec = records[s.id] || 0
    recTotal += rec
    bump('records', recTotal, date)
    if (rec >= FEAT_RULES.recordDay) featDates.recordDay.push(date)

    // Weekly: streak and perfect weeks
    const wk = weekKey(s.startedAt)
    weekCount[wk] = (weekCount[wk] || 0) + 1
    if (weekCount[wk] === Math.max(1, minOf(wk))) {
      const prevWeek = lastWeek && weekKey(new Date(new Date(wk + 'T12:00:00').getTime() - 7 * 86400000))
      run = lastWeek && prevWeek === lastWeek ? run + 1 : 1
      lastWeek = wk
      bump('streak', run, date)
    }
    if (weekCount[wk] === Math.max(2, weekTarget) && !perfect.has(wk)) { perfect.add(wk); featDates.perfectWeek.push(date) }

    // Volume and variety
    const kgLifted = sessionVolume(s, 'kg')
    tonnage += kgLifted
    bump('tonnage', tonnage, date)
    if (kgLifted >= FEAT_RULES.heavyKg) featDates.heavyDay.push(date)
    for (const x of sets) if (x.reps || x.seconds || x.climb || x.cardio) seen.add(x.exerciseId)
    bump('variety', seen.size, date)

    // Every planned set done
    const planned = (s.items || []).reduce((a, it) => a + (Number(it.sets) || 0), 0)
    if (planned > 0 && sets.length >= planned) featDates.fullHouse.push(date)

    // Back after a break
    if (prev && (start - new Date(prev.startedAt)) / 86400000 >= FEAT_RULES.comebackDays) featDates.comeback.push(date)
    prev = s

    // Time of day, weekends, the calendar
    const h = start.getHours()
    if (h < FEAT_RULES.earlyBefore && h >= 4) featDates.earlyBird.push(date)
    if (h >= FEAT_RULES.nightFrom) featDates.nightOwl.push(date)
    if (h < 4) featDates.witching.push(date)
    const dow = start.getDay()
    if (dow === 6 || dow === 0) {
      // A weekend is keyed by its Saturday
      const sat = new Date(start); sat.setDate(sat.getDate() - (dow === 0 ? 1 : 0))
      const k = dayOf(new Date(sat.getFullYear(), sat.getMonth(), sat.getDate(), 12).toISOString())
      const w = weekendDays[k] || (weekendDays[k] = { sat: false, sun: false, done: false })
      if (dow === 6) w.sat = true; else w.sun = true
      if (w.sat && w.sun && !w.done) { w.done = true; featDates.weekend.push(date) }
    }
    if (start.getMonth() === 0 && start.getDate() === 1) featDates.newYear.push(date)
    if (start.getMonth() === 11 && start.getDate() === 25) featDates.christmas.push(date)
    const mins = minutesOf(s)
    if (mins >= FEAT_RULES.twoHoursMin && mins <= FEAT_RULES.twoHoursMax) featDates.twoHours.push(date)
    if (s.plan?.deload && !deloads.has(wk)) { deloads.add(wk); featDates.deloadWeek.push(date) }

    // Strength: heaviest actually lifted on each lift, bodyweight multiples, pull-ups
    for (const k of LIFTS) {
      const id = lifts?.[k]
      if (!id) continue
      for (const x of sets) {
        if (x.exerciseId !== id || !(x.reps >= 1) || !(x.load > 0) || x.unit === 'pin') continue
        best[k] = Math.max(best[k] || 0, convertLoad(x.load, x.unit || unit, 'kg'))
      }
      if (best[k]) {
        bump(k, r2(convertLoad(best[k], 'kg', unit)), date)
        const bw = bwAt(date)
        if (bw) bump(k + 'Bw', r2(best[k] / bw), date)
      }
    }
    if (LIFTS.every(k => best[k])) bump('total', r2(LIFTS.reduce((a, k) => a + best[k], 0)), date)
    for (const x of sets) if (PULL_UPS.includes(x.exerciseId) && x.reps > 0) bump('pullups', x.reps, date)

    // Cardio and climbing
    const sKm = sets.reduce((a, x) => a + (x.cardio?.distance || 0), 0)
    km += sKm
    bump('distance', r2(km), date)
    if (sKm >= FEAT_RULES.fiveKm) featDates.fiveK.push(date)
    const sClimbs = sets.filter(x => x.climb)
    climbs += sClimbs.length
    bump('climbs', climbs, date)
    if (sClimbs.some(x => x.climb.result === 'flash')) featDates.flashDay.push(date)
  }
  featDates.challenge = [...challengeDates].filter(Boolean).map(dayOf).sort()
  featDates.goal = [...goalDates].filter(Boolean).map(dayOf).sort()

  const out = {}
  for (const b of BADGES) {
    if (b.kind === 'feat') {
      const d = featDates[b.id] || []
      out[b.id] = { level: d.length ? 1 : 0, count: d.length, value: d.length, next: null, first: d[0] || null, last: d.at(-1) || null, dates: d }
    } else {
      const th = levelsOf(b, unit)
      const d = levelDates[b.id] || []
      out[b.id] = { level: d.length, count: d.length, value: value[b.id] ?? 0, next: th[d.length] ?? null, first: d[0] || null, last: d.at(-1) || null, dates: d }
    }
  }
  // Without a bodyweight the multiples can't be worked out
  if (!bws.length) for (const k of LIFTS) out[k + 'Bw'].value = null
  out.climbs.used = climbs > 0
  out.flashDay.used = climbs > 0
  return out
}

/** Earned at all: a level badge with a level, or a feat at least once. */
export const isEarned = (st) => !!st && (st.level > 0 || st.count > 0)

/**
 * Badges to show on a wall, in order, grouped: [{ group, items: [{ badge, st }] }].
 * Secret ones only once earned (or as one "???" each); climbing only if you've climbed.
 */
export function badgeWall (state) {
  const out = []
  for (const g of GROUPS) {
    const items = BADGES.filter(b => b.group === g)
      .map(b => ({ badge: b, st: state?.[b.id] || { level: 0, count: 0, value: 0 } }))
      .filter(({ badge, st }) => badge.needs !== 'climb' || st.used || isEarned(st))
    if (items.length) out.push({ group: g, items })
  }
  return out
}

/** How many earned out of how many there are (secret ones count once earned). */
export function badgeTally (state) {
  const shown = badgeWall(state).flatMap(g => g.items).filter(({ badge, st }) => !badge.secret || isEarned(st))
  return { earned: shown.filter(({ st }) => isEarned(st)).length, of: shown.length }
}

/**
 * What changed between two states, for the finish-screen pop-up and crew posts:
 * [{ id, level, count, kind: 'new' | 'level' | 'again' }]
 */
export function badgeChanges (before, after) {
  const out = []
  for (const b of BADGES) {
    const a = before?.[b.id] || { level: 0, count: 0 }
    const z = after?.[b.id]
    if (!z) continue
    if (b.kind === 'level' && z.level > a.level) out.push({ id: b.id, level: z.level, count: z.count, kind: a.level ? 'level' : 'new' })
    if (b.kind === 'feat' && z.count > a.count) out.push({ id: b.id, level: 1, count: z.count, kind: a.count ? 'again' : 'new' })
  }
  return out
}

/** Feats announced to the crew: the first time and then ×5, ×10, ×25, ×50, ×100 (not every early morning). */
export const announceFeat = (count) => count === 1 || [5, 10, 25, 50, 100, 250].includes(count)

/**
 * Compact form shared with the crew: { [id]: [level, count, value, first, last] } (only what's started).
 * Values are in the sender's unit; `unit` travels with the stats.
 */
export function packBadges (state) {
  const out = {}
  for (const b of BADGES) {
    const st = state?.[b.id]
    if (!st) continue
    if (!isEarned(st) && !(st.value > 0)) continue
    if (b.secret && !isEarned(st)) continue // secrets stay secret
    out[b.id] = [st.level, st.count, st.value == null ? null : r2(st.value), st.first, st.last]
  }
  return out
}
export function unpackBadges (packed, unit = 'kg') {
  const out = {}
  for (const b of BADGES) {
    const p = packed?.[b.id]
    const th = levelsOf(b, unit)
    if (!p) { out[b.id] = { level: 0, count: 0, value: 0, next: b.kind === 'level' ? th[0] : null, first: null, last: null, dates: [] }; continue }
    const [level, count, value, first, last] = p
    out[b.id] = { level, count, value, next: b.kind === 'level' ? (th[level] ?? null) : null, first, last, dates: [], ...(b.needs === 'climb' ? { used: true } : {}) }
  }
  return out
}
