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

const activePath = computed(() => route.path)

const items = [
  { label: '专注', icon: IconFocus, to: '/' },
  { label: '计划', icon: IconPlan, to: '/plan' },
  { label: '记录', icon: IconLog, to: '/log' },
]

function isActive(path: string) {
  return path === '/' ? activePath.value === '/' : activePath.value.startsWith(path)
}
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink
      v-for="item in items.slice(0, 2)"
      :key="item.to"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': isActive(item.to) }"
      :to="item.to"
    >
      <span class="bottom-nav__icon" aria-hidden="true">
        <component :is="item.icon" />
      </span>
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>

    <button
      class="bottom-nav__item bottom-nav__item--primary"
      type="button"
      @click="ui.openDiscomfortPanel()"
    >
      <span class="bottom-nav__icon" aria-hidden="true">
        <IconDiscomfort />
      </span>
      <span class="bottom-nav__label">不适应对</span>
    </button>

    <RouterLink
      v-for="item in items.slice(2)"
      :key="item.to"
      class="bottom-nav__item"
      :class="{ 'bottom-nav__item--active': isActive(item.to) }"
      :to="item.to"
    >
      <span class="bottom-nav__icon" aria-hidden="true">
        <component :is="item.icon" />
      </span>
      <span class="bottom-nav__label">{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: var(--surface-elevated);
  border-top: 1px solid var(--border-subtle);
  padding: 8px 4px calc(env(safe-area-inset-bottom) + 8px);
  box-shadow: 0 -4px 12px rgba(15, 32, 67, 0.06);
  gap: 4px;
  z-index: 10;
}

@media (min-width: 1025px) {
  .bottom-nav {
    display: none;
  }
}

.bottom-nav__item {
  appearance: none;
  border: none;
  background: transparent;
  border-radius: 12px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  gap: 4px;
}

.bottom-nav__item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.bottom-nav__item--active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.bottom-nav__item--primary {
  background: var(--color-primary);
  color: white;
  font-weight: 700;
  box-shadow: var(--shadow-card);
}

.bottom-nav__icon {
  width: 22px;
  height: 22px;
  display: grid;
  place-content: center;
}
</style>
