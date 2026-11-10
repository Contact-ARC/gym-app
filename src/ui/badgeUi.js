// Badge words and colours. Every text function takes the translator to use (t for the reader, or a fixed
// language for crew posts, which carry English and Spanish), so the same words serve both.
import { BADGE_BY_ID, levelsOf, FEAT_RULES } from '../lib/badges.js'
import { convertLoad, fmtLoad } from '../lib/training.js'
import { fmtDistance } from '../lib/cardio.js'
import { t } from '../i18n/index.js'

/** Each group's colours: the seal's fill (light → dark) and its edge when it has no tiers */
export const GROUP_TONE = {
  milestones: { light: '#4F8CF0', dark: '#2453B0', edge: '#1B3F87' },
  strength: { light: '#EE6157', dark: '#B5271F', edge: '#861A14' },
  habits: { light: '#3DBB75', dark: '#1D7D47', edge: '#145B33' },
  cardio: { light: '#F07BB4', dark: '#C23C7E', edge: '#8F2A5C' },
  climbing: { light: '#B07A55', dark: '#7A4E31', edge: '#5A3822' },
  secret: { light: '#A779E0', dark: '#6B3BB0', edge: '#4D2885' }
}
/** Bronze, silver, gold, platinum, diamond */
export const TIER_COLOR = ['#C9814A', '#B8C2CE', '#E8B931', '#6FD0D6', '#B79CFF']

const num = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d })
const tonnes = (kg, unit) => (unit === 'lb' ? `${num(convertLoad(kg, 'kg', 'lb'))} lb` : `${num(kg / 1000, kg < 10000 ? 1 : 0)} t`)
const list = (items, tr) => (items.length > 1 ? tr('{a} and {b}', { a: items.slice(0, -1).join(', '), b: items.at(-1) }) : items.join(''))

export function groupName (g, tr = t) {
  return ({ milestones: tr('Milestones'), strength: tr('Strength'), habits: tr('Habits'), cardio: tr('Cardio'), climbing: tr('Climbing'), secret: tr('Secret') })[g] || g
}
export function tierName (level, tr = t) {
  return [tr('Bronze'), tr('Silver'), tr('Gold'), tr('Platinum'), tr('Diamond')][level - 1] || ''
}

/** The badge's name without its level: "Workouts", "Bench plates", "Early bird" */
export function badgeName (id, tr = t, secretHidden = false) {
  if (secretHidden) return '???'
  const names = {
    first: tr('First workout'), workouts: tr('Workouts'), streak: tr('Streak'), records: tr('Record breaker'), tonnage: tr('Tonnage'),
    variety: tr('Explorer'), squat: tr('Squat plates'), bench: tr('Bench plates'), deadlift: tr('Deadlift plates'), total: tr('Total club'),
    benchBw: tr('Bench vs bodyweight'), squatBw: tr('Squat vs bodyweight'), deadliftBw: tr('Deadlift vs bodyweight'), pullups: tr('Pull-ups'),
    recordDay: tr('Record day'), perfectWeek: tr('Perfect week'), fullHouse: tr('Full house'), comeback: tr('Comeback'),
    earlyBird: tr('Early bird'), nightOwl: tr('Night owl'), weekend: tr('Weekend warrior'), heavyDay: tr('Heavy day'),
    deloadWeek: tr('Smart recovery'), challenge: tr('Challenge done'), goal: tr('Goal getter'), distance: tr('Distance'), fiveK: tr('5K'),
    climbs: tr('Climber'), flashDay: tr('Flash'), newYear: tr('New Year, same me'), christmas: tr('Christmas gains'),
    witching: tr('Witching hour'), twoHours: tr('Long haul')
  }
  return names[id] || id
}

/** A badge's value in words: "37", "105 kg", "1.3× bodyweight", "12 t", "8.4 km" */
export function badgeValue (id, v, unit = 'kg', tr = t) {
  if (v == null) return '–'
  const b = BADGE_BY_ID[id]
  if (['squat', 'bench', 'deadlift'].includes(id)) return fmtLoad(v, unit)
  if (id === 'total') return fmtLoad(unit === 'lb' ? Math.round(convertLoad(v, 'kg', 'lb')) : v, unit)
  if (id === 'tonnage') return tonnes(v, unit)
  if (b?.unit === 'x') return tr('{n}× bodyweight', { n: num(v, 2) })
  if (id === 'distance') return fmtDistance(v, unit)
  return num(v)
}

/** A level's threshold in words: "100 kg", "2 plates (100 kg)" */
function step (id, th, i, unit, tr) {
  if (['squat', 'bench', 'deadlift'].includes(id)) return fmtLoad(th, unit)
  return badgeValue(id, th, unit, tr)
}

/** Title with its level or count: "Workouts · Gold", "Bench: 3 plates", "Early bird ×5" */
export function badgeTitle (id, level = 0, count = 0, tr = t, unit = 'kg') {
  const b = BADGE_BY_ID[id]
  const name = badgeName(id, tr)
  if (!b) return name
  if (b.kind === 'feat') return count > 1 ? `${name} ×${count}` : name
  if (['squat', 'bench', 'deadlift'].includes(id) && level) {
    const lift = { squat: tr('Squat'), bench: tr('Bench'), deadlift: tr('Deadlift') }[id]
    return level === 1 ? tr('{lift}: 1 plate', { lift }) : tr('{lift}: {n} plates', { lift, n: level })
  }
  const tiers = levelsOf(b, unit).length
  return tiers > 1 && level ? `${name} · ${tierName(level, tr)}` : name
}

/** How to earn it, with the levels */
export function badgeHow (id, tr = t, unit = 'kg', { weekTarget = 3, secretHidden = false } = {}) {
  if (secretHidden) return tr('A secret. Keep training and it will turn up.')
  const b = BADGE_BY_ID[id]
  const steps = b?.kind === 'level' ? list(levelsOf(b, unit).map((th, i) => step(id, th, i, unit, tr)), tr) : ''
  switch (id) {
    case 'first': return tr('Finish your first workout.')
    case 'workouts': return tr('Finish workouts. Levels at {steps} workouts.', { steps })
    case 'streak': return tr('Train every week without a gap: 2 workouts a week, or your weekly goal if you set one. Levels at {steps} weeks in a row.', { steps })
    case 'records': return tr('Beat your best on an exercise: heavier, more reps or longer. Levels at {steps} records.', { steps })
    case 'tonnage': return tr('Every kilo you have lifted, added up. Levels at {steps}.', { steps })
    case 'variety': return tr('Train different exercises. Levels at {steps} exercises.', { steps })
    case 'squat': case 'bench': case 'deadlift':
      return tr('One rep with plates on the bar: 1 plate a side is {a}, then {steps}. Uses the lift picked for your total in Progress.', { a: fmtLoad(levelsOf(b, unit)[0], unit), steps: list(levelsOf(b, unit).slice(1).map(x => fmtLoad(x, unit)), tr) })
    case 'total': return tr('Your heaviest squat, bench and deadlift added up. Levels at {steps}.', { steps })
    case 'benchBw': case 'squatBw': case 'deadliftBw':
      return tr('Lift a multiple of your bodyweight for one rep. Levels at {steps}. Uses the bodyweight you log in Body.', { steps: list(levelsOf(b, unit).map(x => num(x, 2) + '×'), tr) })
    case 'pullups': return tr('Pull-ups or chin-ups in one set. Levels at {steps} reps.', { steps })
    case 'recordDay': return tr('Set {n} or more records in one workout.', { n: FEAT_RULES.recordDay })
    case 'perfectWeek': return tr('Do all {n} of your workouts in a week.', { n: Math.max(2, weekTarget) })
    case 'fullHouse': return tr('Do every planned set in a workout.')
    case 'comeback': return tr('Train again after {n} days or more off.', { n: FEAT_RULES.comebackDays })
    case 'earlyBird': return tr('Start a workout before 7:00.')
    case 'nightOwl': return tr('Start a workout at 21:00 or later.')
    case 'weekend': return tr('Train on both Saturday and Sunday of the same weekend.')
    case 'heavyDay': return tr('Lift {w} in one workout.', { w: tonnes(FEAT_RULES.heavyKg, unit) })
    case 'deloadWeek': return tr('Train through a deload week, lighter as planned.')
    case 'challenge': return tr("Complete the month's challenge.")
    case 'goal': return tr('Reach one of your goals.')
    case 'distance': return tr('Distance on the treadmill and other cardio, added up. Levels at {steps}.', { steps })
    case 'fiveK': return tr('Cover {d} in one workout.', { d: fmtDistance(FEAT_RULES.fiveKm, unit) })
    case 'climbs': return tr('Climbs logged. Levels at {steps} climbs.', { steps })
    case 'flashDay': return tr('Flash a climb: send it on your first try.')
    case 'newYear': return tr('Train on 1 January.')
    case 'christmas': return tr('Train on Christmas Day.')
    case 'witching': return tr('Start a workout between midnight and 4:00.')
    case 'twoHours': return tr('A workout of two hours or more.')
  }
  return ''
}

/** Where you are: "37 / 50", "Top level", "×4" (null for a feat you haven't earned) */
export function badgeProgress (id, st, unit = 'kg', tr = t) {
  const b = BADGE_BY_ID[id]
  if (!b || !st) return { text: '', pct: 0 }
  if (b.kind === 'feat') return { text: st.count ? tr('Earned {n}×', { n: st.count }) : tr('Not yet'), pct: st.count ? 1 : 0 }
  const th = levelsOf(b, unit)
  if (st.value == null) return { text: tr('Log your bodyweight in Body to track this'), pct: 0 }
  if (st.next == null) return { text: tr('Top level'), pct: 1 }
  const lo = st.level ? th[st.level - 1] : 0
  const pct = Math.max(0, Math.min(1, ((st.value || 0) - lo) / (st.next - lo || 1)))
  // Multiples of bodyweight: "1.12× / 1.25×"
  const show = (v) => (b.unit === 'x' ? `${num(v, 2)}×` : badgeValue(id, v, unit, tr))
  return { text: `${show(st.value || 0)} / ${show(st.next)}`, pct }
}

/** The levels with their thresholds, for the detail sheet: [{ level, label, at, done }] */
export function badgeLadder (id, st, unit = 'kg', tr = t) {
  const b = BADGE_BY_ID[id]
  if (!b || b.kind !== 'level') return []
  const th = levelsOf(b, unit)
  return th.map((x, i) => ({
    level: i + 1,
    label: ['squat', 'bench', 'deadlift'].includes(id) ? (i ? tr('{n} plates', { n: i + 1 }) : tr('1 plate')) : th.length > 1 ? tierName(i + 1, tr) : badgeName(id, tr),
    at: step(id, x, i, unit, tr),
    done: (st?.level || 0) > i,
    date: st?.dates?.[i] || (st?.level === i + 1 ? st?.last : null) || null
  }))
}
