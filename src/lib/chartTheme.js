// Chart colours, checked for colour-blind separation and contrast on each theme's card surface.
import { ref, computed, onBeforeUnmount } from 'vue'
import { Chart } from 'chart.js'

// The app's font in every chart
Chart.defaults.font.family = 'Barlow, system-ui, sans-serif'
Chart.defaults.font.size = 13

const SERIES = {
  light: ['#2457B5', '#C7322B'], // plate blue, plate red
  dark: ['#5A8BE0', '#E3604F']
}

export function useChartTheme () {
  const theme = ref(document.documentElement.dataset.theme || 'light')
  const obs = new MutationObserver(() => { theme.value = document.documentElement.dataset.theme || 'light' })
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  onBeforeUnmount(() => obs.disconnect())

  return computed(() => {
    const dark = theme.value === 'dark'
    return {
      dark,
      series: SERIES[dark ? 'dark' : 'light'],
      ink: dark ? '#9AA4B2' : '#566173',
      grid: dark ? 'rgba(233,237,242,0.07)' : 'rgba(21,32,46,0.07)',
      bar: dark ? '#9AA4B2' : '#566173',
      surface: dark ? '#212833' : '#FFFFFF'
    }
  })
}
