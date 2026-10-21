import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supersetNext } from '../src/lib/supersets.js'

// Simulate a superset by always doing what the app suggests
function run (rows, first = 0) {
  const idx = rows.map((_, k) => k)
  const counts = Object.fromEntries(idx.map(k => [k, 0]))
  const r = Object.fromEntries(rows.map((n, k) => [k, n]))
  const seq = []
  let cur = first
  for (let guard = 0; guard < 50 && cur != null; guard++) {
    counts[cur]++
    const res = supersetNext(idx, cur, counts, r)
    seq.push('ABC'[cur] + counts[cur] + (res.rest ? '|' : ''))
    cur = res.done ? null : res.next
  }
  return seq.join(' ')
}

test('superset of two goes round by round, resting after each round', () => {
  assert.equal(run([3, 3]), 'A1 B1| A2 B2| A3 B3|')
})

test('superset of three does every exercise before repeating', () => {
  assert.equal(run([2, 2, 2]), 'A1 B1 C1| A2 B2 C2|')
})

test('uneven set counts: the longer one finishes on its own', () => {
  assert.equal(run([3, 2]), 'A1 B1| A2 B2| A3|')
  assert.equal(run([2, 3]), 'A1 B1| A2 B2| B3|')
})

test('logging A twice by hand: B catches up before the rest', () => {
  const counts = { 0: 2, 1: 0 }
  const rows = { 0: 3, 1: 3 }
  assert.deepEqual(supersetNext([0, 1], 0, counts, rows), { next: 1, rest: false, done: false })
  counts[1] = 1
  assert.deepEqual(supersetNext([0, 1], 1, counts, rows), { next: 1, rest: false, done: false })
  counts[1] = 2
  assert.deepEqual(supersetNext([0, 1], 1, counts, rows), { next: 0, rest: true, done: false })
})

test('starting on B still completes the round with A before resting', () => {
  assert.equal(run([2, 2], 1), 'B1 A1| A2 B2|')
})
