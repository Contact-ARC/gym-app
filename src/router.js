import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: HomeView, meta: { tab: 'home' } },
    { path: '/day/:index', component: () => import('./views/DayView.vue'), meta: { tab: 'home' } },
    { path: '/exercise/:id', component: () => import('./views/ExerciseView.vue') },
    { path: '/workout/:id', component: () => import('./views/WorkoutView.vue'), meta: { hideNav: true } },
    { path: '/summary/:id', component: () => import('./views/SummaryView.vue') },
    { path: '/history', component: () => import('./views/HistoryView.vue'), meta: { tab: 'progress' } },
    { path: '/progress', component: () => import('./views/ProgressView.vue'), meta: { tab: 'progress' } },
    { path: '/tools', component: () => import('./views/ToolsView.vue'), meta: { tab: 'tools' } },
    { path: '/settings', component: () => import('./views/SettingsView.vue'), meta: { tab: 'settings' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: () => ({ top: 0 })
})
