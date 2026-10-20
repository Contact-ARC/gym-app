// Chart colors validated for colorblind separation and contrast against each theme's surface.
import { useTheme } from 'vuetify'
import { computed } from 'vue'

const SERIES = {
  dark: ['#d9600c', '#2aa98a'],
  light: ['#e8630a', '#18977a']
}

export function useChartTheme () {
  const theme = useTheme()
  return computed(() => {
    const dark = theme.global.current.value.dark
    const ink = dark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.68)'
    const grid = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'
    return { dark, series: SERIES[dark ? 'dark' : 'light'], ink, grid }
  })
}
