<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'

const settingsStore = useSettingsStore()
const ui = useUIStore()

const newTag = ref('')
const theme = computed(() => settingsStore.settings.appearance.theme)

function addTag() {
  const value = newTag.value.trim()
  if (!value) return
  if (!settingsStore.settings.themeTags.includes(value)) {
    settingsStore.settings.themeTags.push(value)
  }
  newTag.value = ''
}

function removeTag(tag: string) {
  settingsStore.settings.themeTags = settingsStore.settings.themeTags.filter((item) => item !== tag)
}

function updateGoal(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  settingsStore.settings.dailyGoalMin = Math.max(15, Math.min(480, value))
}

function changeTheme(value: 'system' | 'light' | 'dark') {
  settingsStore.setTheme(value)
}

function toggleStrategy(category: 'physical' | 'cognitive' | 'emotional', id: string) {
  settingsStore.toggleStrategy(category, id)
}

function moveStrategy(category: 'physical' | 'cognitive' | 'emotional', index: number, delta: number) {
  settingsStore.reorderStrategy(category, index, index + delta)
}

const strategies = computed(() => settingsStore.settings.strategies)
</script>

<template>
  <div class="settings">
    <header class="settings__header">
      <h1>设置</h1>
      <p class="settings__subtitle">定义学习禁区、不适处方与外观偏好</p>
    </header>

    <section class="settings__card">
      <h2>学习禁区（本月主题白名单）</h2>
      <p class="settings__hint">仅允许这些关键词的任务进入本月计划。</p>
      <div class="settings__tags">
        <span v-for="tag in settingsStore.settings.themeTags" :key="tag" class="settings__tag">
          {{ tag }}
          <button type="button" @click="removeTag(tag)">×</button>
        </span>
      </div>
      <div class="settings__tag-input">
        <input v-model="newTag" type="text" placeholder="添加关键词，如 Cursor" @keydown.enter.prevent="addTag" />
        <button type="button" @click="addTag">添加</button>
      </div>
    </section>

    <section class="settings__card">
      <h2>每日专注目标</h2>
      <div class="settings__goal">
        <label>
          <span>目标分钟</span>
          <input :value="settingsStore.settings.dailyGoalMin" type="number" min="15" max="480" step="15" @input="updateGoal" />
        </label>
        <p class="settings__hint">用于首页统计与提醒。</p>
      </div>
    </section>

    <section class="settings__card">
      <h2>不适应对库</h2>
      <p class="settings__hint">排序影响面板呈现的优先级，可随时启用/停用。</p>
      <div class="settings__strategies" v-for="(list, category) in strategies" :key="category">
        <h3>{{ category === 'physical' ? '物理不适' : category === 'cognitive' ? '认知不适' : '情绪不适' }}</h3>
        <ul>
          <li v-for="(item, index) in list" :key="item.id">
            <label>
              <input type="checkbox" :checked="item.enabled" @change="toggleStrategy(category as any, item.id)" />
              <span>{{ item.label }}</span>
            </label>
            <div class="settings__strategy-actions">
              <button type="button" :disabled="index === 0" @click="moveStrategy(category as any, index, -1)">上移</button>
              <button type="button" :disabled="index === list.length - 1" @click="moveStrategy(category as any, index, 1)">下移</button>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <section class="settings__card">
      <h2>外观</h2>
      <div class="settings__appearance">
        <label>
          <input type="radio" name="theme" value="system" :checked="theme === 'system'" @change="changeTheme('system')" />
          系统跟随
        </label>
        <label>
          <input type="radio" name="theme" value="light" :checked="theme === 'light'" @change="changeTheme('light')" />
          浅色
        </label>
        <label>
          <input type="radio" name="theme" value="dark" :checked="theme === 'dark'" @change="changeTheme('dark')" />
          深色
        </label>
      </div>
      <p class="settings__hint">当前偏好尊重系统“减少动态”设置：{{ ui.prefersReducedMotion ? '是' : '否' }}。</p>
    </section>
  </div>
</template>

<style scoped>
.settings {
  padding: 24px 20px 80px;
  display: grid;
  gap: 24px;
}

.settings__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings__subtitle {
  margin: 0;
  color: var(--text-muted);
}

.settings__card {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  padding: 20px;
  display: grid;
  gap: 16px;
}

.settings__hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.settings__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings__tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  font-size: 13px;
}

.settings__tag button {
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
}

.settings__tag-input {
  display: flex;
  gap: 8px;
}

.settings__tag-input input {
  flex: 1;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
}

.settings__tag-input button {
  border: none;
  border-radius: 12px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: #fff;
}

.settings__goal label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings__goal input {
  width: 120px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
}

.settings__strategies {
  display: grid;
  gap: 12px;
}

.settings__strategies h3 {
  margin: 0;
}

.settings__strategies ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.settings__strategies li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.settings__strategies label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.settings__strategy-actions {
  display: flex;
  gap: 6px;
}

.settings__strategy-actions button {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  background: #fff;
  border: 1px solid var(--border-subtle);
}

.settings__appearance {
  display: flex;
  gap: 16px;
}

.settings__appearance label {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (min-width: 1025px) {
  .settings {
    padding: 32px 32px 64px;
    gap: 32px;
  }
}
</style>
