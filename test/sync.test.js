import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toRecords, applyRecord, hashOf } from '../src/lib/syncRecords.js'

function data (over = {}) {
  return {
    createdAt: '2026-01-01',
    profile: { name: 'Ana', unit: 'kg', bar: 20 },
    settings: { routinesUrl: 'https://mine/', reminders: { days: [1], time: '07:00' }, autoBackup: 'weekly', lang: 'es', equipment: { smith: false } },
    sessions: [
      { id: 's1', startedAt: '2026-11-01T10:00', finishedAt: '2026-11-01T11:00', sets: [{ load: 60, reps: 8 }] },
      { id: 's2', startedAt: '2026-11-18T10:00', finishedAt: null, sets: [] } // in progress
    ],
    body: { entries: [{ id: 'b1', date: '2026-11-02', weight: 80 }], photos: [{ id: 'p1', date: '2026-11-02', file: 'photos/p1.jpg', thumb: 'photos/p1-t.jpg' }] },
    goals: [{ id: 'g1', type: 'lift' }],
    plans: [],
    customExercises: [{ id: 'my-1', name: 'Thing' }],
    routineEdits: { 'r-A': { ops: [] } },
    machineSettings: { 'leg-press': [{ label: 'Seat', value: '5' }] },
    exerciseNotes: { squat: 'Knees out' },
    challenges: { '2026-11': { manual: 2 } },
    routineArchive: { '2026-10': { month: '2026-10', days: [] } },
    nextDayKey: 'r-B',
    badgeShowcase: ['workouts'],
    activeSessionId: 's2',
    cache: { routine: { big: true } },
    crew: { key: 'secret' },
    ...over
  }
}
const empty = () => ({
  profile: { unit: 'kg' },
  settings: { routinesUrl: null, reminders: { days: [], time: '18:00' }, autoBackup: 'off' },
  sessions: [], body: { entries: [], photos: [] }, goals: [], plans: [], customExercises: [],
  routineEdits: {}, machineSettings: {}, exerciseNotes: {}, challenges: {}, routineArchive: {}, crew: {}
})

test('sync: the data splits into records, leaving what belongs to the phone', () => {
  const r = toRecords(data())
  const keys = [...r.keys()].sort()
  assert.deepEqual(keys, [
    'body:b1', 'challenge:2026-11', 'edit:r-A', 'exercise:my-1', 'goal:g1', 'machine:leg-press', 'misc:main', 'note:squat',
    'photo:p1', 'profile:main', 'routine:2026-10', 'session:s1', 'settings:main'
  ])
  // The workout in progress, the cache, crew keys and this phone's own settings stay here
  assert.equal(r.has('session:s2'), false)
  const settings = r.get('settings:main').d
  assert.equal('routinesUrl' in settings, false)
  assert.equal('reminders' in settings, false)
  assert.equal(settings.lang, 'es')
  const misc = r.get('misc:main').d
  assert.equal(misc.nextDayKey, 'r-B')
  assert.equal('crew' in misc || 'cache' in misc || 'activeSessionId' in misc, false)
})

test('sync: records put back into an empty phone give the same records', () => {
  const src = toRecords(data())
  const phone = empty()
  for (const { k, i, d } of src.values()) applyRecord(phone, k, i, JSON.parse(JSON.stringify(d)))
  const back = toRecords(phone)
  assert.deepEqual([...back.keys()].sort(), [...src.keys()].sort())
  for (const [key, r] of src) assert.equal(hashOf(back.get(key).d), hashOf(r.d), key)
  // This phone's own settings were kept
  assert.equal(phone.settings.routinesUrl, null)
  assert.deepEqual(phone.settings.reminders, { days: [], time: '18:00' })
})

test('sync: updating and deleting records', () => {
  const phone = data()
  applyRecord(phone, 'session', 's1', { id: 's1', startedAt: '2026-11-01T10:00', finishedAt: '2026-11-01T11:05', sets: [] })
  assert.equal(phone.sessions.find(s => s.id === 's1').finishedAt, '2026-11-01T11:05')
  assert.equal(phone.sessions.length, 2)
  applyRecord(phone, 'session', 's1', null)
  assert.deepEqual(phone.sessions.map(s => s.id), ['s2']) // the one in progress is untouched
  applyRecord(phone, 'note', 'squat', null)
  assert.deepEqual(phone.exerciseNotes, {})
  // Body entries stay in date order
  applyRecord(phone, 'body', 'b0', { id: 'b0', date: '2026-10-01', weight: 82 })
  assert.deepEqual(phone.body.entries.map(e => e.id), ['b0', 'b1'])
})

test('sync: the same content hashes the same whatever the key order (the database reorders keys)', () => {
  assert.equal(hashOf({ a: 1, b: { c: [1, 2], d: 'x' } }), hashOf({ b: { d: 'x', c: [1, 2] }, a: 1 }))
  assert.notEqual(hashOf({ a: 1 }), hashOf({ a: 2 }))
  assert.notEqual(hashOf([1, 2]), hashOf([2, 1]))
  // undefined fields don't exist in JSON
  assert.equal(hashOf({ a: 1, b: undefined }), hashOf({ a: 1 }))
})

test('sync: every field records come from is in the snapshot list', async () => {
  const { SYNCED_FIELDS } = await import('../src/lib/syncRecords.js')
  const d = data()
  const pick = Object.fromEntries(SYNCED_FIELDS.map(f => [f, d[f]]))
  assert.deepEqual([...toRecords(pick).keys()].sort(), [...toRecords(d).keys()].sort())
})
