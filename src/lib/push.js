// Crew notifications through Firebase Cloud Messaging.
//
// The phone gets a push token from Firebase and sends it to the crew board with which kinds of
// notifications it wants (crew_set_push). The server only sends those, and each kind has its own
// Android channel, so it can also be silenced or styled in Android's settings.
// Needs the APK to be built with google-services.json (see the Firebase setup in the README);
// without it the notification settings explain that instead.
import { reactive, watch } from 'vue'
import { registerPlugin } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { state, persist } from '../store.js'
import { inCrew, crewRpc, refreshBoard } from './crew.js'
import { isNative } from './native.js'
import { logError } from './errors.js'
import { toast } from '../ui/toast.js'
import { t, i18n } from '../i18n/index.js'

const PushSetup = registerPlugin('PushSetup')

/** Each kind: its setting, its Android channel, and how loud it is (4 pops up, 3 makes a sound, 2 is quiet). */
export const PUSH_KINDS = [
  { key: 'workouts', channel: 'crew_workouts', importance: 3, label: 'Workouts', hint: 'When someone finishes a workout' },
  { key: 'records', channel: 'crew_records', importance: 3, label: 'Records', hint: 'When someone breaks a record, even with workouts off' },
  { key: 'live', channel: 'crew_live', importance: 3, label: 'Training now', hint: 'When someone starts a workout' },
  { key: 'comments', channel: 'crew_comments', importance: 4, label: 'Comments', hint: 'On your posts, and replies where you commented' },
  { key: 'reactions', channel: 'crew_reactions', importance: 2, label: 'Reactions', hint: 'High fives and emojis on your posts' },
  { key: 'nudges', channel: 'crew_nudges', importance: 4, label: 'Nudges', hint: 'When someone nudges you to train' },
  { key: 'challenges', channel: 'crew_challenges', importance: 3, label: 'Challenges and badges', hint: 'New crew challenges, results, badges, the monthly challenge' },
  { key: 'recap', channel: 'crew_recap', importance: 3, label: 'Weekly recap', hint: 'Sunday evening: how the week went' }
]
export const PUSH_DEFAULTS = { workouts: true, records: true, live: false, comments: true, reactions: true, nudges: true, challenges: true, recap: true }

export const push = reactive({
  available: null, // false: this APK was built without Firebase
  permission: null, // granted | denied | prompt
  busy: false,
  error: null
})

export const pushPrefs = () => ({ ...PUSH_DEFAULTS, ...(state.data.crew.push?.prefs || {}) })

let listening = false
let router = null

async function createChannels () {
  for (const k of PUSH_KINDS) {
    try {
      await PushNotifications.createChannel({
        id: k.channel,
        name: t('Crew: {kind}', { kind: t(k.label) }),
        description: t(k.hint),
        importance: k.importance,
        visibility: 1,
        vibration: k.importance >= 3,
        lights: false
      })
    } catch (e) { logError(e, 'push channel') }
  }
}

async function listen () {
  if (listening) return
  listening = true
  await PushNotifications.addListener('registration', ({ value }) => {
    if (state.data.crew.push.token !== value) {
      state.data.crew.push.token = value
      persist()
    }
    sendSettings()
  })
  await PushNotifications.addListener('registrationError', (err) => {
    push.error = err?.error || String(err)
    logError(new Error(push.error), 'push registration')
  })
  // While the app is open: a quiet toast instead of a notification, and fresh numbers
  await PushNotifications.addListener('pushNotificationReceived', (n) => {
    if (n?.title) toast(n.title)
    refreshBoard()
  })
  // Tapped a notification: open what it's about
  await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    const route = a?.notification?.data?.route
    if (route && router && /^\/crew(\/|$)/.test(route)) router.push(route).catch(() => {})
  })
}

/** Tell the crew board this phone's token and what it wants (or no token: send nothing). */
export async function sendSettings () {
  if (!inCrew.value) return
  const p = state.data.crew.push
  try {
    await crewRpc('crew_set_push', {
      p_token: p.enabled ? p.token : null,
      p_prefs: pushPrefs(),
      p_lang: i18n.lang
    })
    push.error = null
  } catch (e) {
    push.error = e.message
  }
}

export async function checkPush () {
  if (!isNative) { push.available = false; return push }
  try {
    const s = await PushSetup.status()
    push.available = !!s.firebase
  } catch {
    push.available = false
  }
  if (push.available) {
    try { push.permission = (await PushNotifications.checkPermissions()).receive } catch { push.permission = null }
  }
  return push
}

/** Turn crew notifications on: ask for permission, make the channels, get a token. */
export async function enablePush () {
  await checkPush()
  if (!push.available) return false
  push.busy = true
  try {
    let perm = (await PushNotifications.checkPermissions()).receive
    if (perm !== 'granted') perm = (await PushNotifications.requestPermissions()).receive
    push.permission = perm
    if (perm !== 'granted') return false
    state.data.crew.push.enabled = true
    await persist()
    await createChannels()
    await listen()
    await PushNotifications.register() // the token arrives in 'registration', which sends it
    return true
  } catch (e) {
    push.error = String(e?.message || e)
    logError(e, 'push enable')
    return false
  } finally {
    push.busy = false
  }
}

export async function disablePush () {
  state.data.crew.push.enabled = false
  await persist()
  await sendSettings()
}

export async function setPushPref (key, on) {
  state.data.crew.push.prefs = { ...pushPrefs(), [key]: !!on }
  await persist()
  await sendSettings()
}

/** At startup: listeners first (so a tap that opened the app is handled), then refresh the token. */
export async function initPush (r) {
  router = r
  await checkPush()
  if (!push.available) return
  await listen()
  if (state.data.crew.push.enabled && push.permission === 'granted') {
    await createChannels()
    PushNotifications.register().catch((e) => logError(e, 'push register'))
  }
  // Joined a crew, or changed language: the board needs to know
  watch(inCrew, (v) => { if (v) sendSettings() })
  watch(() => i18n.lang, () => { createChannels(); sendSettings() })
}
