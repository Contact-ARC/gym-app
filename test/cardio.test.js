import { test } from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, cardioOf, cardioText, cardioTotals, cardioRecords, fmtDuration, toShownSpeed, fromShownSpeed } from '../src/lib/cardio.js'
import { detectPRs, setsPerMuscle, suggestNext, barSetupFor, isEzBar, platesPerSide } from '../src/lib/training.js'

test('cardio: distance, text and totals', () => {
  assert.equal(distanceKm(1800, 6), 3)
  assert.equal(distanceKm(0, 6), 0)
  assert.deepEqual(cardioOf({ seconds: 1200, speed: 5, incline: 12 }), { speed: 5, incline: 12, distance: 1.67 })
  const set = { seconds: 1800, load: 10, unit: 'kg', cardio: { speed: 6, incline: 12, distance: 3 } }
  assert.equal(cardioText(set, 'kg'), '30 min · 6 km/h · 12% · 3 km · 10 kg')
  assert.equal(fmtDuration(1830), '30:30')
  assert.equal(fmtDuration(3900), '1 h 05')
  // lb users see mph and miles; stored in km/h
  assert.equal(toShownSpeed(8, 'lb'), 5)
  assert.equal(fromShownSpeed(5, 'lb'), 8.05)
  assert.deepEqual(cardioTotals([set, { seconds: 600, cardio: { distance: 1 } }, { reps: 8 }]), { seconds: 2400, km: 4 })
})

test('cardio: records are farthest and longest, not before the second time', () => {
  const a = { exerciseId: 'tm', seconds: 1200, cardio: { speed: 6, distance: 2 } }
  const b = { exerciseId: 'tm', seconds: 1800, cardio: { speed: 6, distance: 3 } }
  assert.deepEqual(cardioRecords([b], [a], 'tm').map(p => [p.type, p.value, p.prev]), [['distance', 3, 2], ['duration', 1800, 1200]])
  assert.deepEqual(detectPRs({ sets: [b] }, [{ sets: [a] }], 'kg').map(p => p.type), ['distance', 'duration'])
  assert.deepEqual(detectPRs({ sets: [a] }, [], 'kg'), [])
  // Counts toward weekly volume, but as half a set
  const vol = setsPerMuscle([{ sets: [b] }], { tm: { primary: ['quads'], secondary: ['glutes'] } })
  assert.deepEqual(vol, { quads: 0.5, glutes: 0.25 })
})

test('cardio: suggestions in minutes', () => {
  const ex = { id: 'incline-treadmill-walk', logType: 'cardio' }
  const item = { exerciseId: ex.id, sets: 1, durationSec: [1200, 1800] }
  const profile = { unit: 'kg' }
  const first = suggestNext({ item, exercise: ex, history: [], profile })
  assert.equal(first.seconds, 1200)
  assert.match(first.text, /20 minutes/)
  const after = suggestNext({ item, exercise: ex, history: [{ sets: [{ seconds: 1500, cardio: { speed: 5, incline: 10, distance: 2 } }] }], profile })
  assert.equal(after.seconds, 1800)
})

test('EZ bar: plates only, half a side each', () => {
  const ez = { id: 'ez-bar-curl', logType: 'weight', equipment: ['EZ bar'] }
  assert.ok(isEzBar(ez))
  assert.deepEqual(barSetupFor(ez, { unit: 'kg', bar: 20 }), { bar: 0, hasBar: true, ez: true })
  assert.deepEqual(platesPerSide(10, 0, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [5])
  // Suggestions are weights you can load: pairs of plates
  const item = { exerciseId: ez.id, sets: 3, repRange: [8, 12] }
  const s = suggestNext({ item, exercise: ez, history: [{ sets: [12, 12, 12].map(r => ({ load: 10, unit: 'kg', reps: r, rir: 3 })) }], profile: { unit: 'kg', increments: { upper: 2.5 } } })
  assert.ok(s.load > 10 && Math.abs((s.load / 2) / 1.25 - Math.round((s.load / 2) / 1.25)) < 1e-9, `loadable: ${s.load}`)
  // A barbell still counts its bar
  assert.equal(barSetupFor({ equipment: ['barbell'], logType: 'weight' }, { unit: 'kg', bar: 20 }).bar, 20)
  assert.equal(barSetupFor({ equipment: ['dumbbells'], logType: 'weight' }, { unit: 'kg' }), null)
})
