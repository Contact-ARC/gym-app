// Small helpers shared by the crew screens.
import { board, memberById } from '../lib/crew.js'
import { days } from '../store.js'
import { badgeTitle } from '../lib/crewStats.js'
import { tn, i18n } from '../i18n/index.js'

const AVATAR = ['var(--plate-red)', 'var(--plate-blue)', 'var(--plate-yellow)', 'var(--plate-green)', 'var(--ink-2)']

/** Each member keeps one colour: their place in the crew picks a plate colour. */
export function avatarStyle (id) {
  const i = board.members.findIndex(m => m.id === id)
  const bg = AVATAR[(i < 0 ? 4 : i) % AVATAR.length]
  return { background: bg, color: bg.includes('yellow') ? '#15202E' : '#FFFFFF' }
}

export const initial = (id) => (memberById.value[id]?.name || '?').trim().charAt(0).toUpperCase()

export function plateIndex (dayId) {
  const i = days.value.findIndex(d => d.id === dayId)
  return i >= 0 ? i : (dayId === 'free' ? -1 : 'ABCDE'.indexOf(dayId))
}

/** A badge's title in the reader's language (the post carries both). */
export function badgeName (payloadOrId, unit) {
  if (typeof payloadOrId === 'string') return badgeTitle(payloadOrId, i18n.lang, unit)
  const p = payloadOrId || {}
  return (i18n.lang === 'es' && p.es?.title) || p.title || (p.id ? badgeTitle(p.id, i18n.lang, p.unit) : '')
}

export const METRICS = {
  workouts: { label: 'Workouts', unit: 'workouts' },
  sets: { label: 'Sets', unit: 'sets' },
  volume: { label: 'Volume', unit: '' },
  records: { label: 'Records', unit: 'records' },
  bestStreak: { label: 'Best streak', unit: 'weeks' }
}

/** "12 workouts", "3 records", "45,200 kg" … */
export function metricText (metric, value, unit, fmtNum) {
  switch (metric) {
    case 'volume': return `${fmtNum(value, 0)} ${unit}`
    case 'sets': return tn(value, '{n} set', '{n} sets')
    case 'records': return tn(value, '{n} record', '{n} records')
    case 'bestStreak': return tn(value, '{n} week', '{n} weeks')
    default: return tn(value, '{n} workout', '{n} workouts')
  }
}
