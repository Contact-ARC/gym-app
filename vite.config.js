import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // Relative base so the bundle works inside the Capacitor WebView
  base: './',
  plugins: [vue(), vuetify({ autoImport: true })],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    chunkSizeWarningLimit: 1500
  }
})
