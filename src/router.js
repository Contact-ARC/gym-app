import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { tab: 'home' } },
    { path: '/day/:index', name: 'day', component: () => import('./views/DayView.vue'), meta: { tab: 'home' } },
    { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue'), meta: { tab: 'library' } },
    { path: '/exercise/:id', name: 'exercise', component: () => import('./views/ExerciseView.vue'), meta: { tab: 'library' } },
    { path: '/workout/:id', name: 'workout', component: () => import('./views/WorkoutView.vue'), meta: { hideNav: true } },
    { path: '/summary/:id', name: 'summary', component: () => import('./views/SummaryView.vue'), meta: { hideNav: true } },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue'), meta: { tab: 'progress' } },
    { path: '/progress', name: 'progress', component: () => import('./views/ProgressView.vue'), meta: { tab: 'progress' } },
    { path: '/tools', name: 'tools', component: () => import('./views/ToolsView.vue'), meta: { tab: 'tools' } },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { tab: 'settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: (to, from, saved) => saved || { top: 0 }
})
