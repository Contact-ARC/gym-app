// Your changes to a routine day, in words ("Added Cable fly", "Squat: 4 sets").
import { t, tn, tx } from '../i18n/index.js'
import { exercisesById } from '../store.js'
import { restLabel } from './format.js'

const exName = (id) => tx(exercisesById.value[id], 'name') || id || ''
const baseId = (ref) => (ref?.startsWith('e:') ? ref.slice(2, ref.lastIndexOf('#')) : null)

/** What a set of field changes means: "4 sets, 8–12 reps, 2 min rest". */
export function describePatch (patch) {
  const parts = []
  if (patch.sets != null) parts.push(tn(patch.sets, '{n} set', '{n} sets'))
  if (patch.repRange) parts.push(t('{lo}–{hi} reps', { lo: patch.repRange[0], hi: patch.repRange[1] }))
  if (patch.durationSec) parts.push(t('{lo}–{hi} s', { lo: patch.durationSec[0], hi: patch.durationSec[1] }))
  if (patch.restSec != null) parts.push(restLabel(patch.restSec))
  if ('notes' in patch) parts.push(patch.notes ? t('new note') : t('note removed'))
  if ('group' in patch) parts.push(patch.group ? t('in a superset') : t('not in a superset'))
  return parts.join(', ')
}

/** One change in words. `all` is the day's full list (to name exercises you added). */
export function describeOp (op, all = []) {
  const idOf = (ref) => baseId(ref) || all.find(o => o.op === 'add' && o.ref === ref)?.item?.exerciseId
  switch (op.op) {
    case 'add': return t('Added {name}', { name: exName(op.item?.exerciseId) })
    case 'remove': return t('Removed {name}', { name: exName(idOf(op.ref)) })
    case 'swap': return t('{a} → {b}', { a: exName(idOf(op.ref)), b: exName(op.exerciseId) })
    case 'move': return t('Moved {name}', { name: exName(idOf(op.ref)) })
    case 'set': return t('{name}: {what}', { name: exName(idOf(op.ref)), what: describePatch(op.patch || {}) })
  }
  return ''
}
