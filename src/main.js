import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import { App as CapApp } from '@capacitor/app'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import './styles.css'

import App from './App.vue'
import router from './router.js'
import { initStore } from './store.js'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'gymDark',
    themes: {
      gymDark: {
        dark: true,
        colors: {
          background: '#0f1115',
          surface: '#181b22',
          'surface-variant': '#232733',
          primary: '#ff7a1a',
          secondary: '#4cc9a6',
          success: '#4caf50',
          warning: '#ffb020',
          error: '#ff5370',
          info: '#5aa9ff'
        }
      },
      gymLight: {
        dark: false,
        colors: {
          background: '#f5f6f8',
          surface: '#ffffff',
          primary: '#e8630a',
          secondary: '#18977a',
          success: '#2e7d32',
          warning: '#b26a00',
          error: '#d32f4b',
          info: '#1f6fd1'
        }
      }
    }
  },
  defaults: {
    VBtn: { rounded: 'lg' },
    VCard: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' }
  }
})

initStore().then(() => {
  const app = createApp(App)
  app.use(vuetify).use(router).mount('#app')

  // Android hardware back button: go back in-app, exit from the home screen
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (router.currentRoute.value.path === '/' || !canGoBack) CapApp.exitApp()
    else router.back()
  }).catch(() => {})
})
