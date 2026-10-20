<template>
  <v-app>
    <v-main class="safe-top">
      <router-view v-slot="{ Component }">
        <component :is="Component" />
      </router-view>
    </v-main>

    <RestTimerBar />

    <v-bottom-navigation
      v-if="!route.meta.hideNav"
      :model-value="route.meta.tab"
      grow
      color="primary"
      class="safe-bottom"
    >
      <v-btn value="home" to="/"><v-icon>mdi-dumbbell</v-icon><span>Train</span></v-btn>
      <v-btn value="progress" to="/progress"><v-icon>mdi-chart-line</v-icon><span>Progress</span></v-btn>
      <v-btn value="tools" to="/tools"><v-icon>mdi-calculator-variant</v-icon><span>Tools</span></v-btn>
      <v-btn value="settings" to="/settings"><v-icon>mdi-cog</v-icon><span>Settings</span></v-btn>
    </v-bottom-navigation>

    <!-- New monthly routine announcement -->
    <v-dialog :model-value="!!announce" max-width="480" persistent>
      <v-card v-if="announce">
        <v-card-title class="text-wrap pt-5">
          <v-icon color="primary" class="mr-2">mdi-calendar-star</v-icon>
          {{ announce.title || 'New routine' }}
        </v-card-title>
        <v-card-text>
          <p v-if="announce.description" class="mb-3">{{ announce.description }}</p>
          <div v-if="announce.whatsNew?.length" class="section-label mt-0">What's new</div>
          <ul class="pl-4">
            <li v-for="(w, i) in announce.whatsNew" :key="i" class="mb-1">{{ w }}</li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="markRoutineSeen">Let's go</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import RestTimerBar from './components/RestTimerBar.vue'
import { state, newRoutineToAnnounce, markRoutineSeen } from './store.js'

const route = useRoute()
const theme = useTheme()

// Don't interrupt a workout with the announcement
const announce = computed(() => (route.meta.hideNav ? null : newRoutineToAnnounce.value))

const media = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyTheme () {
  const pref = state.data.profile.theme
  const dark = pref === 'system' ? (media?.matches ?? true) : pref !== 'light'
  theme.global.name.value = dark ? 'gymDark' : 'gymLight'
}
watchEffect(applyTheme)
media?.addEventListener?.('change', applyTheme)
</script>
