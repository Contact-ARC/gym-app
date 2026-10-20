// Stack of open sheets so the Android back button closes the top one
// instead of navigating away.
const stack = []

export function pushOverlay (close) {
  stack.push(close)
  return () => {
    const i = stack.lastIndexOf(close)
    if (i >= 0) stack.splice(i, 1)
  }
}

/** Returns true if an overlay was closed. */
export function closeTopOverlay () {
  const close = stack[stack.length - 1]
  if (!close) return false
  close()
  return true
}
