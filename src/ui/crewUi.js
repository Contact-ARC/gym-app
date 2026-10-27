// Small helpers shared by the crew screens.
import { board, memberById, me } from '../lib/crew.js'
import { days, state } from '../store.js'
import { badgeTitle } from '../lib/crewStats.js'
import { tn, i18n } from '../i18n/index.js'

const AVATAR = ['var(--plate-red)', 'var(--plate-blue)', 'var(--plate-yellow)', 'var(--plate-green)', 'var(--ink-2)']

/** Colours and emoji you can pick for yourself (Crew settings). Others' picks are only used if they're on these lists. */
export const AVATAR_COLORS = { red: 'var(--plate-red)', blue: 'var(--plate-blue)', yellow: 'var(--plate-yellow)', green: 'var(--plate-green)', purple: '#7A4FB5', teal: '#14808A', orange: '#D2691E', ink: 'var(--ink-2)' }
export const AVATAR_EMOJI = ['💪', '🏋️', '🔥', '⚡', '🦍', '🐻', '🦁', '🐺', '🦅', '🦈', '🐂', '🚀', '⭐', '👑', '🎯', '🧱', '🌵', '🍕', '☕', '😎']

function avatarOf (id) {
  const a = id === me.value ? state.data.crew.avatar : memberById.value[id]?.stats?.avatar
  if (!a || typeof a !== 'object') return {}
  return { color: AVATAR_COLORS[a.color] ? a.color : null, emoji: AVATAR_EMOJI.includes(a.emoji) ? a.emoji : null }
}

/** Each member keeps one colour: their own pick, or their place in the crew picks a plate colour. */
export function avatarStyle (id) {
  const a = avatarOf(id)
  const i = board.members.findIndex(m => m.id === id)
  const bg = a.color ? AVATAR_COLORS[a.color] : AVATAR[(i < 0 ? 4 : i) % AVATAR.length]
  return { background: bg, color: bg.includes('yellow') ? '#15202E' : '#FFFFFF', ...(a.emoji ? { fontSize: '1.15em' } : {}) }
}

/** Their emoji, or the first letter of their name. */
export const initial = (id) => avatarOf(id).emoji || (memberById.value[id]?.name || (id === me.value ? state.data.crew.name : '') || '?').trim().charAt(0).toUpperCase()

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
