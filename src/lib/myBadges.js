// Your badges, worked out from your data (see lib/badges.js for the rules). Recomputed only when
// something that counts changes, so screens can call myBadges() freely.
import { state, streakRule, weeklyMin, days } from '../store.js'
import { evaluateBadges, badgeChanges, BADGE_BY_ID } from './badges.js'
import { convertLoad } from './training.js'
import { DEFAULT_LIFTS } from './goals.js'

let memo = { key: '', value: null }

/** Everything the badges look at, from the store */
function inputs (sessions = state.data.sessions) {
  const p = state.data.profile
  const unit = p.unit || 'kg'
  const bodyweights = (state.data.body?.entries || [])
    .filter(e => e.weight > 0 && e.date)
    .map(e => ({ date: String(e.date).slice(0, 10), kg: convertLoad(e.weight, e.unit || unit, 'kg') }))
  if (!bodyweights.length && p.bodyweight > 0) bodyweights.push({ date: '1970-01-01', kg: convertLoad(p.bodyweight, unit, 'kg') })
  const weekly = state.data.goals.some(g => g.type === 'weekly' && !g.archived)
  return {
    sessions,
    unit,
    lifts: state.data.settings.lifts || DEFAULT_LIFTS,
    bodyweights,
    // A perfect week: your weekly goal, or as many workouts as your routine has days (2 to 6)
    weekTarget: weekly ? weeklyMin.value : Math.min(6, Math.max(2, days.value.length || 3)),
    challengeDates: Object.values(state.data.challenges || {}).map(c => c?.doneAt).filter(Boolean),
    goalDates: (state.data.goals || []).map(g => g.doneAt).filter(Boolean),
    streakMin: streakRule.value
  }
}

/** A cheap fingerprint of what the badges depend on */
function signature (inp) {
  let sets = 0
  let last = ''
  for (const s of inp.sessions) {
    if (!s.finishedAt) continue
    sets += (s.sets || []).length
    if (s.finishedAt > last) last = s.finishedAt
  }
  return [
    inp.sessions.length, sets, last, inp.unit, JSON.stringify(inp.lifts), inp.bodyweights.length, inp.bodyweights.at(-1)?.kg,
    inp.weekTarget, inp.challengeDates.length, inp.goalDates.length, typeof inp.streakMin === 'function' ? 'goal' + weeklyMin.value : inp.streakMin,
    state.data.settings.climbing?.legacyGymId
  ].join('|')
}

/** Where you are on every badge: { [id]: { level, count, value, next, first, last, dates } } */
export function myBadges () {
  const inp = inputs()
  const key = signature(inp)
  if (memo.key === key) return memo.value
  memo = { key, value: evaluateBadges(inp) }
  return memo.value
}

/** The state before one workout (for the first pop-up, so old badges don't pop up) */
export function badgesWithout (sessionId) {
  return evaluateBadges(inputs(state.data.sessions.filter(s => s.id !== sessionId)))
}

/** Compact snapshot: { [id]: [level, count] } */
export const snapshot = (st) => Object.fromEntries(Object.entries(st).filter(([, v]) => v.level || v.count).map(([id, v]) => [id, [v.level, v.count]]))
export const fromSnapshot = (snap) => Object.fromEntries(Object.entries(snap || {}).map(([id, [level, count]]) => [id, { level, count }]))

/**
 * Badges this workout earned you, for the finish screen: [{ id, level, count, kind }].
 * `state.data.badgeSeen` (0.10) remembers what was shown; the first time it starts from what you had before
 * this workout.
 */
export function newBadgesFor (sessionId) {
  const now = myBadges()
  if (!state.data.badgeSeen) state.data.badgeSeen = snapshot(badgesWithout(sessionId))
  const changes = badgeChanges(fromSnapshot(state.data.badgeSeen), now).filter(c => BADGE_BY_ID[c.id])
  if (changes.length) state.data.badgeSeen = { ...state.data.badgeSeen, ...snapshot(Object.fromEntries(changes.map(c => [c.id, now[c.id]]))) }
  return changes
}

/** Pinned on your profile and the crew board (up to 3) */
export const SHOWCASE_MAX = 3
export function showcase () {
  const st = myBadges()
  return (state.data.badgeShowcase || []).filter(id => st[id] && (st[id].level || st[id].count)).slice(0, SHOWCASE_MAX)
}
