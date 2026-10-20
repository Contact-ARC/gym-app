/**
 * Rest after a set of items[i]. Inside a superset (items sharing a `group`),
 * there's no rest until the last exercise of the group.
 */
export function effectiveRest (items, i) {
  const it = items[i]
  if (!it) return 0
  if (it.group) {
    const groupIdx = items.map((x, j) => (x.group === it.group ? j : -1)).filter(j => j >= 0)
    if (i !== groupIdx[groupIdx.length - 1]) return 0
  }
  return it.restSec ?? 90
}

/** Index of the next exercise to do after logging a set of items[i] (for the rest-timer label). */
export function nextInGroup (items, i) {
  const it = items[i]
  if (!it?.group) return i
  const groupIdx = items.map((x, j) => (x.group === it.group ? j : -1)).filter(j => j >= 0)
  const pos = groupIdx.indexOf(i)
  return groupIdx[(pos + 1) % groupIdx.length]
}
