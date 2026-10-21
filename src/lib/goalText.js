// Goals in words, in the app language.
import { t, tn, tx } from '../i18n/index.js'
import { exercisesById } from '../store.js'
import { fmtNum } from './format.js'

const exName = (id) => tx(exercisesById.value[id], 'name') || id || ''

/** A number for a goal, with its unit: "102.5 kg", "12 reps", "1.75×", "18.5%". */
export function goalValue (type, v, unit) {
  if (v == null || !isFinite(v)) return '–'
  switch (type) {
    case 'lift': case 'total': case 'weight': case 'leanMass': return `${fmtNum(v, 1)} ${unit}`
    case 'waist': return `${fmtNum(v, 1)} ${unit}`
    case 'reps': return tn(v, '{n} rep', '{n} reps')
    case 'time': return `${fmtNum(v, 0)} s`
    case 'bwMultiple': return `${fmtNum(v, 2)}×`
    case 'bodyFat': return `${fmtNum(v, 1)}%`
    case 'dots': return fmtNum(v, 1)
    case 'weekly': return String(v)
  }
  return fmtNum(v, 1)
}

/** "Bench press: 100 kg", "Train 4 times a week", … (target shown in the display unit). */
export function goalTitle (goal, target, unit) {
  const v = goalValue(goal.type, target, unit)
  switch (goal.type) {
    case 'lift':
      if (goal.basis === 'e1rm') return t('{ex}: {v} estimated max', { ex: exName(goal.exerciseId), v })
      return (goal.reps || 1) > 1 ? t('{ex}: {v} for {n} reps', { ex: exName(goal.exerciseId), v, n: goal.reps }) : t('{ex}: lift {v}', { ex: exName(goal.exerciseId), v })
    case 'reps': return t('{ex}: {v} in one set', { ex: exName(goal.exerciseId), v })
    case 'time': return t('{ex}: hold {v}', { ex: exName(goal.exerciseId), v })
    case 'bwMultiple': return t('{ex}: {v} your bodyweight', { ex: exName(goal.exerciseId), v })
    case 'total': return t('Powerlifting total of {v}', { v })
    case 'dots': return t('DOTS score of {v}', { v })
    case 'weight': return t('Weigh {v}', { v })
    case 'bodyFat': return t('Body fat at {v}', { v })
    case 'waist': return t('Waist at {v}', { v })
    case 'leanMass': return t('Lean mass of {v}', { v })
    case 'weekly': return tn(target, 'Train {n} time a week', 'Train {n} times a week')
  }
  return ''
}

export const GOAL_LABELS = {
  lift: 'Lift a weight',
  reps: 'More reps',
  time: 'Hold longer',
  bwMultiple: 'Lift a multiple of your bodyweight',
  total: 'Powerlifting total',
  dots: 'DOTS score',
  weight: 'Bodyweight',
  bodyFat: 'Body fat',
  waist: 'Waist',
  leanMass: 'Lean mass',
  weekly: 'Workouts per week'
}
export const goalLabel = (type) => (type ? t(GOAL_LABELS[type] || type) : '')
