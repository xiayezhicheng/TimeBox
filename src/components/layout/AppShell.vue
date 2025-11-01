<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import BottomNavBar from './BottomNavBar.vue'
import DesktopNavBar from './DesktopNavBar.vue'
import TodayPlanSidebar from './TodayPlanSidebar.vue'
import DiscomfortPanel from '../discomfort/DiscomfortPanel.vue'
import { useUIStore } from '../../stores/ui'
import { useTimeboxStore } from '../../stores/timeboxes'
import { useSettingsStore } from '../../stores/settings'
import { useSessionsStore } from '../../stores/sessions'
import { useStatsStore } from '../../stores/stats'
import { useDiscomfortStore } from '../../stores/discomfort'
import { useSyncStore } from '../../stores/sync'

const ui = useUIStore()
const timeboxes = useTimeboxStore()
const settings = useSettingsStore()
const sessions = useSessionsStore()
const stats = useStatsStore()
const discomfort = useDiscomfortStore()
const syncStore = useSyncStore()
const isDesktop = useMediaQuery('(min-width: 1025px)')

onMounted(() => {
  syncStore
    .bootstrap()
    .catch((error) => {
      console.error('Failed to bootstrap cloud sync', error)
    })
    .finally(() => {
      Promise.all([
        timeboxes.bootstrap(),
        settings.bootstrap(),
        sessions.bootstrap(),
        stats.bootstrap(),
      ])
        .then(() => {
          stats.recalculateFromSessions(sessions.sessions)
        })
        .catch((error) => console.error(error))

      discomfort.bootstrap()
    })
})
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--desktop': isDesktop }">
    <aside v-if="isDesktop" class="app-shell__rail" aria-label="主导航">
      <DesktopNavBar />
    </aside>

    <main class="app-shell__main" role="main">
      <RouterView v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <aside v-if="isDesktop" class="app-shell__sidebar" aria-label="今日计划">
      <TodayPlanSidebar />
    </aside>

    <BottomNavBar v-if="!isDesktop" class="app-shell__nav" />

    <DiscomfortPanel
      :open="ui.isDiscomfortPanelOpen"
      @close="ui.closeDiscomfortPanel"
    />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: 1fr auto;
  background: var(--surface-app);
  color: var(--text-primary);
}

.app-shell--desktop {
  grid-template-columns: 220px minmax(0, 1fr) 320px;
  grid-template-rows: 1fr;
}

.app-shell__main {
  padding: 16px 16px 72px;
}

.app-shell__sidebar {
  border-left: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  padding: 24px;
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-card);
}

.app-shell__nav {
  position: sticky;
  bottom: 0;
}

.app-shell__rail {
  padding: 32px 0 32px 32px;
}

.app-shell--desktop .app-shell__main {
  padding: 32px;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 160ms ease-out, transform 160ms ease-out;
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
