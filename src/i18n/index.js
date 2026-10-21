// Tiny translation layer. English text is the key, so untranslated strings
// simply show in English. Placeholders use {name}.
//   t('Start day {id}', { id: 'B' })  →  "Empezar día B"
// When the same English word needs different translations, add a context prefix:
//   t('body|Back') shows "Back" in English and "Espalda" in Spanish (vs t('Back') → "Atrás").
import { reactive } from 'vue'
import es from './es.js'

const DICTS = { es }
export const LANGS = [
  { value: 'en', label: 'English', locale: 'en-GB' },
  { value: 'es', label: 'Español', locale: 'es-ES' }
]

export const i18n = reactive({ lang: 'en' })

export function setLang (lang) {
  i18n.lang = DICTS[lang] || lang === 'en' ? lang : 'en'
  document.documentElement.lang = i18n.lang
}

/** Guess from the phone's language the first time. */
export function deviceLang () {
  const l = (navigator.language || 'en').toLowerCase()
  return l.startsWith('es') ? 'es' : 'en'
}

export function t (key, vars) {
  if (key == null) return ''
  key = String(key)
  const dict = DICTS[i18n.lang]
  let s = (dict && dict[key]) || (key.includes('|') ? key.slice(key.indexOf('|') + 1) : key)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m))
  return s
}

/** Pick singular/plural: tn(n, '{n} set', '{n} sets') */
export function tn (n, one, many, vars = {}) {
  return t(n === 1 ? one : many, { n, ...vars })
}

/** Locale for dates and numbers. */
export function locale () {
  return LANGS.find(l => l.value === i18n.lang)?.locale || undefined
}

/** Localised field from content with an optional `es: {...}` block (exercises, routines). */
export function tx (obj, field) {
  if (!obj) return undefined
  const loc = obj[i18n.lang]
  return (loc && loc[field] != null) ? loc[field] : obj[field]
}
