import { reactive } from 'vue'

export const toastState = reactive({ text: '', action: null, actionLabel: '', id: 0 })
let timer = null

/** Show a short message, optionally with one action button (e.g. Undo). */
export function toast (text, { actionLabel = '', action = null, ms = 3500 } = {}) {
  clearTimeout(timer)
  toastState.text = text
  toastState.action = action
  toastState.actionLabel = actionLabel
  toastState.id++
  timer = setTimeout(hideToast, ms)
}

export function hideToast () {
  clearTimeout(timer)
  toastState.text = ''
  toastState.action = null
}

export function runToastAction () {
  const fn = toastState.action
  hideToast()
  fn?.()
}
