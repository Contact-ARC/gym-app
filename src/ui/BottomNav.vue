<template>
  <nav class="nav" aria-label="Main">
    <RouterLink
      v-for="t in tabs" :key="t.to" :to="t.to" class="nav-item"
      :class="{ on: active === t.tab }" :aria-current="active === t.tab ? 'page' : undefined"
    >
      <span class="nav-icon"><Icon :name="t.icon" :size="24" /></span>
      <span class="nav-label">{{ t.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import Icon from './Icon.vue'
defineProps({ active: String })
const tabs = [
  { to: '/', tab: 'home', icon: 'train', label: 'Train' },
  { to: '/progress', tab: 'progress', icon: 'progress', label: 'Progress' },
  { to: '/tools', tab: 'tools', icon: 'tools', label: 'Tools' },
  { to: '/settings', tab: 'settings', icon: 'settings', label: 'Settings' }
]
</script>

<style scoped>
.nav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000;
  display: flex; justify-content: space-around;
  height: calc(var(--nav-h) + var(--safe-bottom));
  padding-bottom: var(--safe-bottom);
  background: var(--card);
  border-top: 1px solid var(--line);
}
.nav-item {
  flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  color: var(--ink-3); font-size: 12px; font-weight: 600;
}
.nav-icon { display: grid; place-items: center; width: 56px; height: 30px; border-radius: 15px; transition: background-color 160ms ease; }
.nav-item.on { color: var(--ink); }
.nav-item.on .nav-icon { background: var(--card-2); }
.nav-item:active .nav-icon { background: var(--press); }
</style>
