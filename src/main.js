import { createApp } from 'vue'
import { App as CapApp } from '@capacitor/app'

// Fonts are bundled so the app looks the same offline
import '@fontsource/barlow/latin-400.css'
import '@fontsource/barlow/latin-500.css'
import '@fontsource/barlow/latin-600.css'
import '@fontsource/barlow/latin-700.css'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './styles/base.css'

import App from './App.vue'
import router from './router.js'
import { initStore, state, days, activeSession, startSession } from './store.js'
import { closeTopOverlay } from './ui/overlay.js'
import { t, tn, setLang, deviceLang } from './i18n/index.js'
import { initCrew } from './lib/crew.js'
import { initAutoBackup } from './lib/backup.js'
import { resumeRest } from './lib/restTimer.js'

initStore().then(() => {
  setLang(state.data.settings.lang || deviceLang())
  const app = createApp(App).use(router)
  // t() and tn() are available in every template without importing them
  app.config.globalProperties.t = t
  app.config.globalProperties.tn = tn
  app.mount('#app')
  initCrew()
  initAutoBackup()
  resumeRest()

  // Android back: close an open sheet first, then go back, then exit from the home screen
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return
    const path = router.currentRoute.value.path
    if (path === '/' || !canGoBack) CapApp.exitApp()
    else router.back()
  }).catch(() => {})

  // App-icon shortcuts: gymcrew://start-next and gymcrew://progress
  function openLink (url) {
    if (!url || !url.startsWith('gymcrew://')) return
    const what = url.replace('gymcrew://', '').replace(/\/$/, '')
    if (what === 'progress') return router.push('/progress')
    if (what === 'start-next') {
      if (activeSession.value) return router.push(`/workout/${activeSession.value.id}`)
      const i = days.value[state.data.nextDayIndex] ? state.data.nextDayIndex : 0
      const id = days.value.length ? startSession(i) : null
      router.push(id ? `/workout/${id}` : '/')
    }
  }
  CapApp.addListener('appUrlOpen', ({ url }) => openLink(url)).catch(() => {})
  CapApp.getLaunchUrl().then(r => openLink(r?.url)).catch(() => {})
})
