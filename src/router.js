import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { tab: 'home' } },
    { path: '/day/:key', name: 'day', component: () => import('./views/DayView.vue'), meta: { tab: 'home' } },
    { path: '/edit/:key', name: 'edit-day', component: () => import('./views/DayEditView.vue'), meta: { tab: 'home' } },
    { path: '/routines', name: 'routines', component: () => import('./views/RoutinesView.vue'), meta: { tab: 'home' } },
    { path: '/plan/:id', name: 'plan', component: () => import('./views/PlanView.vue'), meta: { tab: 'home' } },
    { path: '/goals', name: 'goals', component: () => import('./views/GoalsView.vue'), meta: { tab: 'progress' } },
    { path: '/library', name: 'library', component: () => import('./views/LibraryView.vue'), meta: { tab: 'library' } },
    { path: '/exercise/:id', name: 'exercise', component: () => import('./views/ExerciseView.vue'), meta: { tab: 'library' } },
    { path: '/workout/:id', name: 'workout', component: () => import('./views/WorkoutView.vue'), meta: { hideNav: true } },
    { path: '/summary/:id', name: 'summary', component: () => import('./views/SummaryView.vue'), meta: { hideNav: true } },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue'), meta: { tab: 'progress' } },
    { path: '/progress', name: 'progress', component: () => import('./views/ProgressView.vue'), meta: { tab: 'progress' } },
    { path: '/body', name: 'body', component: () => import('./views/BodyView.vue'), meta: { tab: 'progress' } },
    { path: '/report/:month?', name: 'report', component: () => import('./views/ReportView.vue'), meta: { tab: 'progress' } },
    { path: '/crew', name: 'crew', component: () => import('./views/CrewView.vue'), meta: { tab: 'crew' } },
    { path: '/crew/post/:id', name: 'crew-post', component: () => import('./views/CrewPostView.vue'), meta: { tab: 'crew' } },
    { path: '/crew/member/:id', name: 'crew-member', component: () => import('./views/CrewMemberView.vue'), meta: { tab: 'crew' } },
    { path: '/tools', name: 'tools', component: () => import('./views/ToolsView.vue'), meta: { tab: 'tools' } },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue'), meta: { tab: 'home' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 12, behavior: 'smooth' }
    return { top: 0 }
  }
})
