import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPRs, gymBound } from '../src/lib/training.js'
import { sessionGymId } from '../src/lib/climbing.js'

const legCurl = { id: 'machine-leg-curl', logType: 'weight', loadUnit: 'pin', equipment: ['leg curl machine'] }
const legPress = { id: 'leg-press', logType: 'weight', equipment: ['leg press machine', 'plates'] }
const bench = { id: 'barbell-bench-press', logType: 'weight', equipment: ['barbell', 'flat bench', 'rack'] }
const byId = { [legCurl.id]: legCurl, [legPress.id]: legPress, [bench.id]: bench }

test('gyms: machines are per gym, free weights are not', () => {
  assert.ok(gymBound(legCurl))
  assert.ok(gymBound(legPress)) // plate-loaded machines differ too
  assert.ok(!gymBound(bench))
  assert.ok(!gymBound({ id: 'treadmill', logType: 'cardio', equipment: ['treadmill'] }))
})

test('gyms: where a workout was done, old ones included', () => {
  const settings = { climbing: { gyms: [{ id: 'gym1' }, { id: 'b' }], gymId: 'b', legacyGymId: 'gym1' } }
  assert.equal(sessionGymId({ gymId: 'b' }, settings), 'b')
  assert.equal(sessionGymId({ climbGym: 'b' }, settings), 'b')
  assert.equal(sessionGymId({}, settings), 'gym1') // from before gyms
  assert.equal(sessionGymId({}, {}), 'gym1')
})

test('gyms: machine records only against the same gym', () => {
  const set = (exerciseId, load, reps) => ({ exerciseId, load, reps, unit: 'kg', rir: 2 })
  const a1 = { id: 'a1', gymId: 'a', sets: [set(legCurl.id, 60, 10), set(bench.id, 80, 5)] }
  const b1 = { id: 'b1', gymId: 'b', sets: [set(legCurl.id, 30, 10), set(bench.id, 70, 5)] }
  const b2 = { id: 'b2', gymId: 'b', sets: [set(legCurl.id, 35, 10), set(bench.id, 75, 5)] }
  const opts = { exercisesById: byId }
  // 35 kg at gym b beats gym b's 30, even though gym a's machine had 60 on it; bench compares everywhere
  const prs = detectPRs(b2, [a1, b1], 'kg', opts)
  assert.deepEqual(prs.filter(p => p.exerciseId === legCurl.id).map(p => [p.type, p.value]).sort(), [['e1rm', prs.find(p => p.type === 'e1rm' && p.exerciseId === legCurl.id).value], ['load', 35]].sort())
  assert.equal(prs.filter(p => p.exerciseId === bench.id).length, 0)
  // First time at a gym: a baseline, not a record
  assert.deepEqual(detectPRs(b1, [a1], 'kg', opts).filter(p => p.exerciseId === legCurl.id), [])
  // Without the options (older callers): everything compared
  assert.equal(detectPRs(b2, [a1, b1], 'kg').filter(p => p.exerciseId === legCurl.id).length, 0)
})
