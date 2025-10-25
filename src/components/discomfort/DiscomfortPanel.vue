<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { useDiscomfortStore } from '../../stores/discomfort'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()
const discomfort = useDiscomfortStore()

const categories = computed(() => settings.enabledStrategies)

function handleClose() {
  emit('close')
}

function selectCategory(key: 'physical' | 'cognitive' | 'emotional') {
  discomfort.setCategory(key)
}

function toggleStrategy(id: string) {
  discomfort.toggleStrategy(id)
}

function runStrategy(id: string) {
  discomfort.runStrategy(id)
}
</script>

<template>
  <div v-if="open" class="panel" role="dialog" aria-modal="true">
    <div class="panel__backdrop" @click="handleClose" aria-hidden="true" />
    <div class="panel__content">
      <header class="panel__header">
        <h2>我现在的不适是——</h2>
        <button class="panel__close" type="button" @click="handleClose">
          关闭
        </button>
      </header>

      <div class="panel__categories">
        <button
          v-for="category in discomfort.categories"
          :key="category.id"
          type="button"
          class="panel__category"
          :class="{ 'panel__category--active': discomfort.activeCategory === category.id }"
          @click="selectCategory(category.id)"
        >
          {{ category.label }}
        </button>
      </div>

      <div class="panel__strategies">
        <label
          v-for="strategy in categories[discomfort.activeCategory]"
          :key="strategy.id"
          class="panel__strategy"
        >
          <input
            type="checkbox"
            :checked="discomfort.selected.includes(strategy.id)"
            @change="toggleStrategy(strategy.id)"
          />
          <div class="panel__strategy-body">
            <div class="panel__strategy-title">{{ strategy.label }}</div>
            <p v-if="strategy.description" class="panel__strategy-desc">
              {{ strategy.description }}
            </p>
            <button type="button" class="panel__strategy-run" @click.stop="runStrategy(strategy.id)">
              执行
            </button>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  z-index: 40;
}

.panel__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}

.panel__content {
  position: relative;
  background: var(--surface-elevated);
  width: min(420px, 100%);
  max-width: 100%;
  padding: 24px;
  overflow-y: auto;
}

.panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel__close {
  background: transparent;
  border: none;
  color: var(--text-muted);
}

.panel__categories {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  margin-bottom: 16px;
}

.panel__category {
  border: 1px solid var(--border-stronger);
  border-radius: 16px;
  padding: 16px;
  font-size: 16px;
  font-weight: 700;
  background: var(--surface-raised);
}

.panel__category--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.panel__strategies {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel__strategy {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-raised) 90%, white 10%);
}

.panel__strategy-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panel__strategy-title {
  font-weight: 600;
}

.panel__strategy-desc {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.panel__strategy-run {
  align-self: flex-start;
  border: none;
  border-radius: 12px;
  padding: 6px 14px;
  background: var(--color-primary);
  color: #fff;
}
</style>
