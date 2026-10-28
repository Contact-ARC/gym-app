import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRADES, climbSettings, gradeList, rankOf, hardest, climbTotals, climbRecords, climbText, isSent, swatch, systemFor, climbKind
} from '../src/lib/climbing.js'
import { detectPRs, setsPerMuscle } from '../src/lib/training.js'

const c = (grade, result = 'send', extra = {}) => ({ kind: 'boulder', system: 'font', grade, rank: GRADES.font.indexOf(grade), result, attempts: 1, seconds: 0, wall: '', note: '', ...extra })

test('grade systems and ranks', () => {
  assert.equal(climbSettings({}).boulder, 'font')
  assert.equal(climbSettings({}).route, 'french')
  assert.equal(systemFor('route', { climbing: { route: 'yds' } }), 'yds')
  assert.equal(climbKind({ climbType: 'route' }), 'route')
  assert.equal(climbKind({}), 'boulder')
  assert.ok(rankOf('6B+', 'font') > rankOf('6B', 'font'))
  assert.ok(rankOf('7a', 'french') > rankOf('6c+', 'french'))
  assert.ok(rankOf('5.10a', 'yds') > rankOf('5.9', 'yds'))
  // Your gym's colours, easiest first
  const settings = { climbing: { boulder: 'colour', colours: ['Green', 'Blue', 'Red'] } }
  assert.deepEqual(gradeList('colour', settings), ['Green', 'Blue', 'Red'])
  assert.equal(rankOf('Red', 'colour', settings), 2)
  assert.equal(swatch('Blue'), '#2F6FD6')
  assert.equal(swatch('Azul'), '#2F6FD6')
  assert.equal(swatch('6B'), null)
})

test('hardest send and flash, totals', () => {
  const list = [c('6A', 'flash'), c('6B+', 'send', { attempts: 4 }), c('6C', 'project', { attempts: 6 }), c('6A+', 'flash')]
  assert.equal(hardest(list).font.grade, '6B+')
  assert.equal(hardest(list, { flashOnly: true }).font.grade, '6A+')
  assert.deepEqual(climbTotals(list), { climbs: 4, sends: 3, flashes: 2, projects: 1, attempts: 12, seconds: 0 })
  assert.equal(isSent(c('6A', 'project')), false)
  // Different grade systems aren't compared
  const mixed = [...list, { ...c('V5'), system: 'v', rank: GRADES.v.indexOf('V5') }]
  assert.equal(hardest(mixed).font.grade, '6B+')
  assert.equal(hardest(mixed).v.grade, 'V5')
})

test('records: new hardest send and new hardest flash, not on the first session', () => {
  const before = [c('6A', 'flash'), c('6B', 'send')]
  assert.deepEqual(climbRecords([c('6B+', 'send')], before, 'bouldering').map(p => [p.type, p.value, p.prev]), [['grade', '6B+', '6B']])
  assert.deepEqual(climbRecords([c('6A+', 'flash'), c('6A', 'send')], before, 'bouldering').map(p => [p.type, p.value, p.prev]), [['flash', '6A+', '6A']])
  // A flash at a new hardest grade is one record, not two
  assert.deepEqual(climbRecords([c('6C', 'flash')], before, 'bouldering').map(p => p.type), ['grade'])
  // Not sent isn't a record
  assert.deepEqual(climbRecords([c('7A', 'project')], before, 'bouldering'), [])
  // Through detectPRs: the first session is the baseline
  const s = (id, climbs) => ({ id, sets: climbs.map(x => ({ exerciseId: 'bouldering', climb: x })) })
  assert.deepEqual(detectPRs(s('a', [c('6B')]), [], 'kg'), [])
  assert.deepEqual(detectPRs(s('b', [c('6C')]), [s('a', [c('6B')])], 'kg').map(p => p.type), ['grade'])
})

test('a climb counts a quarter set toward weekly muscle volume', () => {
  const ex = { bouldering: { id: 'bouldering', primary: ['forearms', 'lats'], secondary: ['biceps'] } }
  const sess = [{ sets: [1, 2, 3, 4].map(() => ({ exerciseId: 'bouldering', climb: c('6A') })) }]
  const v = setsPerMuscle(sess, ex)
  assert.equal(v.forearms, 1)
  assert.equal(v.lats, 1)
  assert.equal(v.biceps, 0.5)
})

test('climb text', () => {
  assert.equal(climbText(c('6B+', 'flash', { wall: 'Cave', seconds: 130 })), '6B+ · Flash · Cave · 2:10')
  assert.equal(climbText(c('6C', 'project', { attempts: 5 })), '6C · Not yet · 5 tries')
  assert.equal(climbText({ ...c('6a'), kind: 'route', system: 'french', style: 'lead' }), '6a · Sent · lead')
})
