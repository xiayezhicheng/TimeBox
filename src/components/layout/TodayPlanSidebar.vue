<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useTimeboxStore } from '../../stores/timeboxes'
import { formatDateTitle } from '../../utils/datetime'

const timeboxStore = useTimeboxStore()

const today = ref(new Date())

let tickTimer: number | undefined

onMounted(() => {
  tickTimer = window.setInterval(() => {
    today.value = new Date()
  }, 60_000)
})

onUnmounted(() => {
  if (tickTimer) {
    window.clearInterval(tickTimer)
  }
})

const plannedToday = computed(() =>
  timeboxStore
    .timeboxesForDate(today.value)
    .filter((box) => box.status !== 'done' && box.status !== 'skipped'),
)
</script>

<template>
  <section class="sidebar">
    <header class="sidebar__header">
      <h2 class="sidebar__title">今日计划</h2>
      <p class="sidebar__subtitle">{{ formatDateTitle(today) }}</p>
    </header>
    <div v-if="plannedToday.length" class="sidebar__list">
      <article
        v-for="box in plannedToday"
        :key="box.id"
        class="sidebar__item"
        :data-type="box.type"
      >
        <span class="sidebar__time">{{ timeboxStore.formatRange(box) }}</span>
        <span class="sidebar__titleText">
          {{ box.title || (box.type === 'input' ? '输入练习' : '输出实践') }}
        </span>
      </article>
    </div>
    <p v-else class="sidebar__empty">今天还没有安排。去 /plan 规划一下吧。</p>
  </section>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar__title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}

.sidebar__subtitle {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.sidebar__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 160px);
  overflow-y: auto;
  padding-right: 4px;
}

.sidebar__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-raised) 90%, white 10%);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
}

.sidebar__item[data-type='input'] {
  border-left: 4px solid #6c95ff;
}

.sidebar__item[data-type='output'] {
  border-left: 4px solid #60c08b;
}

.sidebar__time {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}

.sidebar__titleText {
  font-size: 14px;
  font-weight: 600;
}

.sidebar__empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}
</style>
