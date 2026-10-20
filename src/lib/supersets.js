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
