// Climbing: grades, what a logged climb looks like, records and simple stats. Pure (no store), tested in
// test/climbing.test.js.
//
// A climb is logged as a set with a `climb` object instead of weight and reps:
//   { kind: 'boulder'|'route', system, grade, rank, wall, result: 'flash'|'send'|'project',
//     attempts, seconds, note, style: 'toprope'|'lead' (routes) }
// `rank` is the grade's position in its system when it was logged, so comparing grades still works if
// you later reorder your gym's colours. Grades are only compared within the same system.
import { t, tn } from '../i18n/index.js'

export const GRADES = {
  font: ['3', '4', '4+', '5', '5+', '6A', '6A+', '6B', '6B+', '6C', '6C+', '7A', '7A+', '7B', '7B+', '7C', '7C+', '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A'],
  v: ['VB', 'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17'],
  french: ['3', '4a', '4b', '4c', '5a', '5b', '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a', '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c'],
  yds: ['5.5', '5.6', '5.7', '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b', '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b', '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d', '5.15a', '5.15b', '5.15c', '5.15d']
}
export const SYSTEMS = {
  boulder: [{ value: 'font', label: 'Font (6A, 6B+…)' }, { value: 'v', label: 'V scale (V0, V5…)' }, { value: 'colour', label: "Your gym's colours" }],
  route: [{ value: 'french', label: 'French (6a, 6b+…)' }, { value: 'yds', label: 'YDS (5.10a…)' }, { value: 'colour', label: "Your gym's colours" }]
}
/** Colour circuits, easiest first, when you haven't set your own. */
export const DEFAULT_COLOURS = ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Red', 'Purple', 'Black']
const SWATCH = {
  white: '#F4F5F7', blanco: '#F4F5F7', yellow: '#F2C230', amarillo: '#F2C230', orange: '#EE8A2E', naranja: '#EE8A2E',
  green: '#2E9E5B', verde: '#2E9E5B', blue: '#2F6FD6', azul: '#2F6FD6', red: '#D23B33', rojo: '#D23B33',
  purple: '#8A4FC2', morado: '#8A4FC2', lila: '#8A4FC2', black: '#1B1F26', negro: '#1B1F26', pink: '#E86AA6', rosa: '#E86AA6',
  grey: '#8B95A3', gray: '#8B95A3', gris: '#8B95A3', brown: '#8A5A3C', marrón: '#8A5A3C', turquoise: '#1FB5B0', turquesa: '#1FB5B0'
}
/** A CSS colour for a colour-circuit grade ("Blue" → blue), or null. */
export function swatch (grade) {
  return SWATCH[String(grade || '').trim().toLowerCase()] || null
}

/** Default grade systems: Font for boulders and French for routes (what most gyms in Spain use). */
export function climbSettings (settings) {
  const c = settings?.climbing || {}
  return {
    boulder: c.boulder || 'font',
    route: c.route || 'french',
    colours: Array.isArray(c.colours) && c.colours.length ? c.colours : DEFAULT_COLOURS.map(x => t('colour|' + x))
  }
}
/** Bouldering or roped climbing, from the exercise. */
export const climbKind = (exercise) => (exercise?.climbType === 'route' ? 'route' : 'boulder')
export function systemFor (kind, settings) { return climbSettings(settings)[kind === 'route' ? 'route' : 'boulder'] }
export function gradeList (system, settings) {
  return system === 'colour' ? climbSettings(settings).colours : (GRADES[system] || GRADES.font)
}
export function rankOf (grade, system, settings) { return gradeList(system, settings).indexOf(grade) }

export const isClimb = (s) => !!s?.climb
export const isSent = (c) => c?.result === 'flash' || c?.result === 'send'

/** The rank to compare by: the stored one, or the grade's place in its (built-in) list. */
function rankFor (c, settings) {
  if (Number.isFinite(c?.rank) && c.rank >= 0) return c.rank
  return rankOf(c?.grade, c?.system, settings)
}

/** Hardest climb sent (flashes count), per grade system: { [system]: { grade, rank } } */
export function hardest (climbs, { flashOnly = false, settings = null } = {}) {
  const out = {}
  for (const c of climbs) {
    if (!(flashOnly ? c.result === 'flash' : isSent(c))) continue
    const r = rankFor(c, settings)
    if (r < 0) continue
    if (!out[c.system] || r > out[c.system].rank) out[c.system] = { grade: c.grade, rank: r }
  }
  return out
}

/** The climb objects from a list of logged sets. */
export const climbsIn = (sets) => (sets || []).filter(isClimb).map(s => s.climb)

/** One session's (or any list's) numbers. */
export function climbTotals (climbs) {
  const sends = climbs.filter(isSent).length
  const flashes = climbs.filter(c => c.result === 'flash').length
  return {
    climbs: climbs.length,
    sends,
    flashes,
    projects: climbs.length - sends,
    attempts: climbs.reduce((n, c) => n + (c.attempts || 1), 0),
    seconds: climbs.reduce((n, c) => n + (c.seconds || 0), 0)
  }
}

/**
 * Records in one workout against everything before it, per exercise and grade system:
 *   grade: hardest send so far · flash: hardest flash so far. The first time isn't a record.
 */
export function climbRecords (mine, before, exerciseId) {
  const prs = []
  const now = hardest(mine); const was = hardest(before)
  for (const [system, h] of Object.entries(now)) {
    const p = was[system]
    if (p && h.rank > p.rank) prs.push({ exerciseId, type: 'grade', value: h.grade, prev: p.grade, system })
  }
  const nowF = hardest(mine, { flashOnly: true }); const wasF = hardest(before, { flashOnly: true })
  for (const [system, h] of Object.entries(nowF)) {
    const p = wasF[system]
    // Only worth a line when it isn't already the hardest-send record at that grade
    if (p && h.rank > p.rank && !prs.some(x => x.type === 'grade' && x.system === system && x.value === h.grade)) {
      prs.push({ exerciseId, type: 'flash', value: h.grade, prev: p.grade, system })
    }
  }
  return prs
}

export function mmss (secs) {
  const s = Math.max(0, Math.round(secs || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const RESULT_LABEL = { flash: 'Flash', send: 'Sent', project: 'Not yet' }
export const RESULT_ICON = { flash: 'flash', send: 'checkBold', project: 'refresh' }

/** "6B+ · Flash · Cave · 2:10" for lists, shares and crew posts. */
export function climbText (c, { withWall = true } = {}) {
  if (!c) return ''
  const parts = [c.grade, t(RESULT_LABEL[c.result] || 'Sent')]
  if (c.result !== 'flash' && (c.attempts || 1) > 1) parts.push(tn(c.attempts, '{n} try', '{n} tries'))
  if (c.style === 'lead') parts.push(t('lead'))
  if (withWall && c.wall) parts.push(c.wall)
  if (c.seconds) parts.push(mmss(c.seconds))
  return parts.join(' · ')
}

/** Climbing counts toward weekly muscle volume, but lightly: a session of 20 problems isn't 20 hard sets. */
export const CLIMB_SET_WEIGHT = 0.25
