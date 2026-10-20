import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  // Relative base so the bundle works inside the Capacitor WebView
  base: './',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
})
