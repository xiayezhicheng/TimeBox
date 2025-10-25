<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useUIStore } from '../../stores/ui'
import IconFocus from '../icons/IconFocus.vue'
import IconPlan from '../icons/IconPlan.vue'
import IconLog from '../icons/IconLog.vue'
import IconDiscomfort from '../icons/IconDiscomfort.vue'

const route = useRoute()
const ui = useUIStore()

const items = [
  { label: '专注', icon: IconFocus, to: '/' },
  { label: '计划', icon: IconPlan, to: '/plan' },
  { label: '记录', icon: IconLog, to: '/log' },
]

const activePath = computed(() => route.path)

function isActive(path: string) {
  if (path === '/') return activePath.value === '/'
  return activePath.value.startsWith(path)
}
</script>

<template>
<nav class="desktop-nav" aria-label="主导航">
  <div class="desktop-nav__brand">
    <span class="desktop-nav__logo">时间宝盒</span>
    <p class="desktop-nav__tagline">到点就停，在这里成体系地专注。</p>
  </div>

  <div class="desktop-nav__links">
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="desktop-nav__item"
      :class="{ 'desktop-nav__item--active': isActive(item.to) }"
    >
      <component :is="item.icon" class="desktop-nav__icon" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </div>

  <button type="button" class="desktop-nav__cta" @click="ui.openDiscomfortPanel()">
    <IconDiscomfort aria-hidden="true" />
    <span>不适应对</span>
  </button>
</nav>
</template>

<style scoped>
.desktop-nav {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: calc(100vh - 64px);
  max-height: 100vh;
  padding: 24px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-card);
}

.desktop-nav__brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.desktop-nav__logo {
  font-weight: 800;
  font-size: 20px;
}

.desktop-nav__tagline {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.desktop-nav__links {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 24px 0;
}

.desktop-nav__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 16px;
  text-decoration: none;
  color: var(--text-muted);
  font-weight: 600;
  transition: background 140ms ease, color 140ms ease;
}

.desktop-nav__item--active {
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  color: var(--color-primary);
}

.desktop-nav__icon {
  width: 20px;
  height: 20px;
}

.desktop-nav__cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: none;
  border-radius: 18px;
  padding: 12px 18px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
</style>
