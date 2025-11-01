<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useUIStore } from '../stores/ui'
import { useSyncStore } from '../stores/sync'

const settingsStore = useSettingsStore()
const ui = useUIStore()
const syncStore = useSyncStore()

const newTag = ref('')
const connectSyncKey = ref('')
const syncFeedback = ref<string | null>(null)
const copying = ref(false)
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

const syncStatusLabel = computed(() => {
  switch (syncStore.status) {
    case 'disabled':
      return '未启用'
    case 'syncing':
      return '同步中…'
    case 'ready':
      return '已连接'
    case 'error':
      return '同步失败'
    default:
      return '未知'
  }
})

const lastSyncDisplay = computed(() => {
  if (!syncStore.lastSyncAt) return '尚未同步'
  try {
    return new Date(syncStore.lastSyncAt).toLocaleString()
  } catch {
    return '时间未知'
  }
})

async function handleRegisterSync() {
  syncFeedback.value = null
  try {
    const key = await syncStore.registerNew()
    connectSyncKey.value = key
    syncFeedback.value = '已生成新的同步密钥，请在其他设备中输入以完成配对。'
  } catch (error) {
    syncFeedback.value = error instanceof Error ? error.message : '创建失败，请稍后重试。'
  }
}

async function handleConnectSync() {
  syncFeedback.value = null
  try {
    await syncStore.connectWithKey(connectSyncKey.value)
    syncFeedback.value = '已连接并完成同步。'
  } catch (error) {
    syncFeedback.value = error instanceof Error ? error.message : '连接失败，请检查密钥是否正确。'
  }
}

async function handlePullSync() {
  syncFeedback.value = null
  try {
    await syncStore.pullNow()
    syncFeedback.value = '已从云端获取最新数据。'
  } catch (error) {
    syncFeedback.value = error instanceof Error ? error.message : '同步失败，请稍后重试。'
  }
}

function handleDisableSync() {
  syncFeedback.value = null
  syncStore.disableSync()
  syncFeedback.value = '已停用云同步，数据仍保留在当前设备。'
}

async function handleCopyKey() {
  if (!syncStore.syncKey) return
  syncFeedback.value = null
  if (!navigator.clipboard) {
    syncFeedback.value = '当前环境不支持一键复制，请手动选择密钥。'
    return
  }
  copying.value = true
  try {
    await navigator.clipboard.writeText(syncStore.syncKey)
    syncFeedback.value = '同步密钥已复制到剪贴板。'
  } catch {
    syncFeedback.value = '复制失败，请手动选择文本。'
  } finally {
    copying.value = false
  }
}

const syncErrorMessage = computed(() => syncStore.lastError)
</script>

<template>
  <div class="settings">
    <header class="settings__header">
      <h1>设置</h1>
      <p class="settings__subtitle">定义学习禁区、不适处方与外观偏好</p>
    </header>

    <section class="settings__card">
      <h2>云同步（Cloudflare D1）</h2>
      <p class="settings__hint">生成同步密钥，在不同设备之间共享时间盒、会话与设置。</p>

      <div v-if="syncStore.status === 'disabled'" class="settings__sync-block">
        <button
          type="button"
          class="settings__primary-btn"
          :disabled="syncStore.isBusy"
          @click="handleRegisterSync"
        >
          {{ syncStore.isBusy ? '创建中…' : '创建同步密钥' }}
        </button>
        <div class="settings__sync-divider" role="separator">或</div>
        <label class="settings__sync-field">
          <span>输入已有同步密钥</span>
          <input
            v-model="connectSyncKey"
            type="text"
            placeholder="粘贴来自其他设备的 32 位密钥"
          />
        </label>
        <button
          type="button"
          class="settings__secondary-btn"
          :disabled="syncStore.isBusy || !connectSyncKey"
          @click="handleConnectSync"
        >
          {{ syncStore.isBusy ? '连接中…' : '连接云端数据' }}
        </button>
      </div>

      <div v-else class="settings__sync-active">
        <div class="settings__sync-field">
          <span>当前同步密钥</span>
          <div class="settings__sync-key">
            <input :value="syncStore.syncKey ?? ''" readonly />
            <button type="button" :disabled="copying" @click="handleCopyKey">
              {{ copying ? '复制中…' : '复制' }}
            </button>
          </div>
        </div>
        <dl class="settings__sync-status">
          <div>
            <dt>状态</dt>
            <dd>{{ syncStatusLabel }}</dd>
          </div>
          <div>
            <dt>最近同步</dt>
            <dd>{{ lastSyncDisplay }}</dd>
          </div>
        </dl>
        <div class="settings__sync-actions">
          <button type="button" class="settings__secondary-btn" :disabled="syncStore.isBusy || syncStore.status === 'syncing'" @click="handlePullSync">
            {{ syncStore.status === 'syncing' ? '同步中…' : '立即同步' }}
          </button>
          <button type="button" class="settings__danger-btn" @click="handleDisableSync">
            停用云同步
          </button>
        </div>
      </div>

      <p v-if="syncFeedback" class="settings__sync-feedback">{{ syncFeedback }}</p>
      <p v-if="syncErrorMessage" class="settings__sync-error">错误：{{ syncErrorMessage }}</p>
    </section>

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

.settings__primary-btn,
.settings__secondary-btn,
.settings__danger-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}

.settings__primary-btn {
  background: var(--color-primary);
  color: #fff;
}

.settings__secondary-btn {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.settings__danger-btn {
  background: color-mix(in srgb, var(--color-danger, #ff4d4f) 16%, transparent);
  color: var(--color-danger, #d2232a);
}

.settings__primary-btn:disabled,
.settings__secondary-btn:disabled,
.settings__danger-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings__sync-block {
  display: grid;
  gap: 12px;
  align-items: start;
}

.settings__sync-divider {
  text-transform: uppercase;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-align: center;
  color: var(--text-muted);
}

.settings__sync-field {
  display: grid;
  gap: 6px;
}

.settings__sync-field span {
  font-size: 13px;
  color: var(--text-muted);
}

.settings__sync-field input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
  font-family: var(--font-monospace, ui-monospace, SFMono-Regular, SFMono, Consolas, 'Liberation Mono', Menlo, monospace);
  font-size: 13px;
}

.settings__sync-key {
  display: flex;
  gap: 8px;
}

.settings__sync-key button {
  padding: 0 16px;
  border-radius: 12px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
}

.settings__sync-status {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 8px 0;
}

.settings__sync-status dt {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.settings__sync-status dd {
  margin: 0;
  font-weight: 600;
}

.settings__sync-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.settings__sync-feedback {
  margin: 0;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: 12px;
  font-size: 13px;
}

.settings__sync-error {
  margin: 0;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--color-danger, #ff4d4f) 12%, transparent);
  color: var(--color-danger, #d2232a);
  border-radius: 12px;
  font-size: 13px;
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
