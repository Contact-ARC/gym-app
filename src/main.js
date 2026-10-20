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
import { initStore } from './store.js'
import { closeTopOverlay } from './ui/overlay.js'

initStore().then(() => {
  createApp(App).use(router).mount('#app')

  // Android back: close an open sheet first, then go back, then exit from the home screen
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (closeTopOverlay()) return
    const path = router.currentRoute.value.path
    if (path === '/' || !canGoBack) CapApp.exitApp()
    else router.back()
  }).catch(() => {})
})
