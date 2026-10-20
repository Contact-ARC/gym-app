export function prescription (item, exercise = null) {
  if (!item) return ''
  const sets = item.sets || 1
  const side = exercise?.perSide ? '/side' : ''
  if (item.durationSec) return `${sets} × ${item.durationSec[0]}–${item.durationSec[1]}s${side}`
  if (item.repRange) {
    const [lo, hi] = item.repRange
    return `${sets} × ${lo === hi ? lo : `${lo}–${hi}`}${side}`
  }
  return `${sets} sets`
}

/** 95 → "1:35" */
export function mmss (secs) {
  const s = Math.max(0, Math.round(secs || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Rest as people say it: "90 s", "2 min", "2:30" */
export function restLabel (secs) {
  if (!secs) return 'no rest'
  if (secs < 60) return `${secs} s rest`
  if (secs % 60 === 0) return `${secs / 60} min rest`
  return `${mmss(secs)} rest`
}

/** "Day A — Chest & Triceps" → "Chest & Triceps" (the badge already shows the letter) */
export function dayTitle (name, id) {
  if (!name) return id ? `Day ${id}` : 'Workout'
  return name.replace(/^day\s+[a-z0-9]+\s*[—–-]\s*/i, '') || name
}

export function weekdayDate (d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function relativeDay (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff < 7) return `${diff} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function fmtDate (iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtNum (n, dp = 1) {
  if (n == null || !isFinite(n)) return '—'
  return Number(n.toFixed(dp)).toLocaleString()
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

export const muscleLabel = (m) => MUSCLE_LABELS[m] || m

export function youtubeSearchUrl (exerciseName) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(`${exerciseName} proper form`)
}
