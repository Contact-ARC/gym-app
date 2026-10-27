import { t, tn, locale, i18n } from '../i18n/index.js'
import { state } from '../store.js'
import { fmtLoad } from './training.js'
import { planActive, daysBetween } from './routines.js'

export function prescription (item, exercise = null) {
  if (!item) return ''
  const sets = item.sets || 1
  const side = exercise?.perSide ? t('/side') : ''
  if (item.durationSec) return `${sets} × ${item.durationSec[0]}–${item.durationSec[1]}s${side}`
  if (item.repRange) {
    const [lo, hi] = item.repRange
    return `${sets} × ${lo === hi ? lo : `${lo}–${hi}`}${side}`
  }
  return tn(sets, '{n} set', '{n} sets')
}

/** 95 → "1:35" */
export function mmss (secs) {
  const s = Math.max(0, Math.round(secs || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Rest as people say it: "90 s", "2 min", "2:30" */
export function restLabel (secs) {
  if (!secs) return t('no rest')
  if (secs < 60) return t('{s} s rest', { s: secs })
  if (secs % 60 === 0) return t('{m} min rest', { m: secs / 60 })
  return t('{t} rest', { t: mmss(secs) })
}

/** "Day A — Chest & Triceps" → "Chest & Triceps" (the badge already shows the letter) */
export function dayTitle (name, id) {
  if (!name) return id ? t('Day {id}', { id }) : t('Workout')
  return name.replace(/^(day|día|dia)\s+[a-z0-9]+\s*[—–-]\s*/i, '') || name
}

/** A logged workout's title in the current language (older workouts look up the routine they came from). */
export function sessionTitle (s) {
  if (!s) return ''
  let name = s.dayName
  if (i18n.lang !== 'en') {
    if (s.dayNameEs) name = s.dayNameEs
    else {
      const rts = [state.data.cache.routine, state.data.routineArchive?.[s.routineMonth], ...Object.values(state.data.routineArchive || {})]
      for (const r of rts) {
        const d = r?.days?.find(x => x.id === s.dayId && x.name === s.dayName)
        if (d?.es?.name) { name = d.es.name; break }
      }
    }
  }
  return dayTitle(name, s.dayId)
}

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

export function weekdayDate (d = new Date()) {
  return cap(d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }))
}

export function relativeDay (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return t('today')
  if (diff === 1) return t('yesterday')
  if (diff > 1 && diff < 7) return t('{n} days ago', { n: diff })
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
}

export function fmtDate (iso) {
  return cap(new Date(iso).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))
}

/** "2026-11" → "November 2026" */
export function monthName (month, opts = { month: 'long', year: 'numeric' }) {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString(locale(), opts)
  // "Octubre de 2026" as a heading, but "tu informe de octubre" inside a sentence
  return opts.year ? cap(s) : s
}

/** Workout length: "<1" for a workout under a minute, "–" when unknown. */
export function fmtMins (m) {
  if (m == null || !isFinite(m)) return '–'
  return m < 1 ? '<1' : String(Math.round(m))
}

export function fmtNum (n, dp = 1) {
  if (n == null || !isFinite(n)) return '—'
  return Number(n.toFixed(dp)).toLocaleString(locale())
}

export const MUSCLE_LABELS = {
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  triceps: 'Triceps',
  biceps: 'Biceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  abs: 'Abs',
  obliques: 'Obliques',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves'
}

export const muscleLabel = (m) => MUSCLE_LABELS[m] ? t(MUSCLE_LABELS[m]) : m

export function youtubeSearchUrl (exerciseName) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${exerciseName} proper form`)
}

/** A personal record in words: { main: "10 reps at 60 kg", was: "was 8" } */
export function prText (p, unit) {
  switch (p.type) {
    case 'reps': return {
      main: p.load ? t('{n} reps at {load}', { n: p.value, load: fmtLoad(p.load, unit) }) : tn(p.value, '{n} rep', '{n} reps'),
      was: t('was {n}', { n: p.prev })
    }
    case 'time': return { main: t('Longest set {n} s', { n: p.value }), was: t('was {n} s', { n: p.prev }) }
    case 'load': return { main: t('Heaviest set {v}', { v: fmtLoad(p.value, unit) }), was: t('was {n}', { n: fmtLoad(p.prev, unit) }) }
    default: return { main: t('Estimated max {v}', { v: fmtLoad(p.value, unit) }), was: t('was {n}', { n: fmtLoad(p.prev, unit) }) }
  }
}

/** Most telling record first: reps, heaviest, estimated max, time. */
export const PR_ORDER = { reps: 0, load: 1, e1rm: 2, time: 3 }

/** "12 Dec" from a YYYY-MM-DD key. */
export function shortDay (key) {
  if (!key) return ''
  return new Date(key + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
}

/** When a plan from My routines shows on Train. */
export function planStatus (p) {
  const u = p?.use
  if (!u || !planActive(p, state.today)) return t('Not in use')
  if (u.until === 'month') return t('In use this month')
  if (u.until === 'date') {
    const left = daysBetween(state.today, u.endsOn)
    if (left <= 3) return left === 0 ? t('In use, last day today') : tn(left, 'In use, ends tomorrow', 'In use, {n} days left')
    return t('In use until {date}', { date: shortDay(u.endsOn) })
  }
  return t('In use every month')
}

/** Plan days, in words: "2 days" / "Day E". */
export function planDaysLine (p) {
  const n = p?.days?.length || 0
  const ex = (p?.days || []).reduce((t, d) => t + (d.items?.length || 0), 0)
  return n === 1 ? tn(ex, '{n} exercise', '{n} exercises') : tn(n, '{n} day', '{n} days')
}
