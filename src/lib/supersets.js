/**
 * Rest after a set of items[i]. Inside a superset (items sharing a `group`),
 * there's no rest until the last exercise of the group.
 */
export function effectiveRest (items, i) {
  const it = items[i]
  if (!it) return 0
  // A superset is a run of neighbours sharing a group (the workout screen groups them the same way)
  if (it.group && items[i + 1]?.group === it.group) return 0
  return it.restSec ?? 90
}

/**
 * Who goes next after logging a set of item `i` in a superset (indices = the items in it, in order).
 * Goes round by round, A1 B1 C1 → rest → A2 B2 C2 → rest …, and if someone fell behind
 * (e.g. you logged A twice) it catches them up before resting.
 * @param {number[]} indices  item indexes in the superset
 * @param {number}   i        item just logged
 * @param {object}   counts   { [index]: planned sets logged so far, including this one }
 * @param {object}   rows     { [index]: planned sets }
 * @returns {{ next: number|null, rest: boolean, done: boolean }}  done = every exercise in it is finished
 */
export function supersetNext (indices, i, counts, rows) {
  const open = indices.filter(j => counts[j] < rows[j])
  if (!open.length) return { next: null, rest: true, done: true }
  const low = Math.min(...open.map(j => counts[j]))
  const roundDone = open.every(j => counts[j] === counts[i])
  if (roundDone) return { next: open.find(j => counts[j] === low), rest: true, done: false }
  const pos = indices.indexOf(i)
  const cyclic = [...indices.slice(pos + 1), ...indices.slice(0, pos + 1)]
  return { next: cyclic.find(j => open.includes(j) && counts[j] === low), rest: false, done: false }
}

/** Is item i really in a superset (a neighbour shares its group)? */
export function inSuperset (items, i) {
  const g = items[i]?.group
  return !!g && (items[i - 1]?.group === g || items[i + 1]?.group === g)
}
