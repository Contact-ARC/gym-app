import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentSets, doneByMember, nextTurn, loadsOn, sharedBar, barChange } from '../src/lib/togetherPlan.js'

const plan = { items: [{ exerciseId: 'bench', sets: 2 }, { exerciseId: 'row', sets: 1 }] }
let rev = 0
const set = (member, item, setId, extra = {}) => ({ rev: ++rev, member, kind: 'set', payload: { item, setId, load: 60, unit: 'kg', reps: 8, ...extra } })

test('together: the latest version of each set counts, taken-back ones do not', () => {
  const log = [set('a', 0, 's1'), set('a', 0, 's1', { load: 62.5 }), set('b', 0, 's2'), { rev: ++rev, member: 'b', kind: 'unset', payload: { setId: 's2' } }]
  assert.deepEqual(currentSets(log).map(s => [s.setId, s.load]), [['s1', 62.5]])
  assert.deepEqual(doneByMember(log), { a: { 0: 1 } })
  // Warm-ups don't count as sets done
  assert.deepEqual(doneByMember([set('a', 0, 'w', { type: 'warmup' })]), {})
})

test('together: turns go round the group, then to the next exercise', () => {
  const members = ['a', 'b', 'c']
  let log = [set('a', 0, '1')]
  assert.deepEqual(nextTurn({ members, plan, log, from: 'a', item: 0 }), { item: 0, turn: 'b' })
  log = [...log, set('b', 0, '2')]
  assert.deepEqual(nextTurn({ members, plan, log, from: 'b', item: 0 }), { item: 0, turn: 'c' })
  log = [...log, set('c', 0, '3')]
  assert.deepEqual(nextTurn({ members, plan, log, from: 'c', item: 0 }), { item: 0, turn: 'a' })
  // Second round: c skips ahead on another machine; a, b finish bench
  log = [...log, set('a', 0, '4'), set('b', 0, '5')]
  assert.deepEqual(nextTurn({ members, plan, log, from: 'b', item: 0 }), { item: 0, turn: 'c' })
  log = [...log, set('c', 0, '6')]
  // Everyone done on bench: row, starting with the first person
  assert.deepEqual(nextTurn({ members, plan, log, from: 'c', item: 0 }), { item: 1, turn: 'a' })
  // Someone who did their row early is skipped when it comes round
  const early = [...log, set('a', 1, '7')]
  assert.deepEqual(nextTurn({ members, plan, log: early, from: 'c', item: 0 }), { item: 1, turn: 'b' })
  // All done
  const all = [...early, set('b', 1, '8'), set('c', 1, '9')]
  assert.equal(nextTurn({ members, plan, log: all, from: 'c', item: 1 }).turn, null)
})

test('together: what each person is lifting, from sets or notes', () => {
  const log = [
    { rev: ++rev, member: 'b', kind: 'note', payload: { item: 0, load: 135, unit: 'lb', ms: [{ label: 'Seat', value: '4' }] } },
    set('a', 0, 'x', { load: 80 })
  ]
  const l = loadsOn(log, 0, 'kg')
  assert.equal(l.a.load, 80)
  assert.equal(l.a.from, 'set')
  assert.equal(Math.round(l.b.load * 10) / 10, 61.2)
  assert.deepEqual(l.b.ms, [{ label: 'Seat', value: '4' }])
})

test('together: one bar, the lighter stack inside the heavier one', () => {
  const plates = [25, 20, 15, 10, 5, 2.5, 1.25]
  const s = sharedBar([{ id: 'me', load: 80 }, { id: 'ana', load: 60 }, { id: 'juan', load: 100 }], 20, plates)
  // Ana's warm-up goes 20, 40 (10 a side), so her 60 is a second 10, not a swap to a 20
  assert.deepEqual(s.order.map(o => [o.id, o.load, o.perSide]), [['ana', 60, [10, 10]], ['me', 80, [10, 10, 10]], ['juan', 100, [10, 10, 10, 10]]])
  // Changing lifter is only the difference
  assert.deepEqual(barChange(s, 'ana', 'me'), { add: [10], remove: [] })
  assert.deepEqual(barChange(s, 'juan', 'ana'), { add: [], remove: [10, 10] })
  // Everyone warms up on the lightest person's ramp
  assert.equal(s.warmups[0].load, 20)
  assert.ok(s.warmups.every(w => w.load < 60))
  // Alone, or someone at the bar's weight: nothing to share
  assert.equal(sharedBar([{ id: 'me', load: 80 }], 20, plates), null)
  assert.equal(sharedBar([{ id: 'me', load: 80 }, { id: 'ana', load: 20 }], 20, plates), null)
})
