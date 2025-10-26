<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import FocusReviewForm from './FocusReviewForm.vue'
import { useSessionsStore } from '../../stores/sessions'
import { TITLE_NOT_ALLOWED_ERROR, useTimeboxStore } from '../../stores/timeboxes'
import { useSettingsStore } from '../../stores/settings'
import { useStatsStore } from '../../stores/stats'
import { useDiscomfortStore } from '../../stores/discomfort'
import { useUIStore } from '../../stores/ui'
import { useSessionTimer } from '../../composables/useSessionTimer'
import type { StrategyAction, Timebox, TimeboxType } from '../../types/models'
import { formatSecondsToClock } from '../../utils/format'
import {
  formatTime,
  pad,
  timeToMinutes,
  minutesToTime,
} from '../../utils/datetime'
import {
  playTone,
  requestNotificationPermission,
  sendNotification,
  vibrate,
} from '../../services/notifications'

const sessions = useSessionsStore()
const timeboxes = useTimeboxStore()
const settings = useSettingsStore()
const stats = useStatsStore()
const discomfort = useDiscomfortStore()
const uiStore = useUIStore()
const timer = useSessionTimer()

const typeOptions: { label: string; value: TimeboxType }[] = [
  { label: '输入', value: 'input' },
  { label: '输出', value: 'output' },
]
type StrategyCategory = 'physical' | 'cognitive' | 'emotional'
const durationOptions = [30, 45, 60]

const selectedType = ref<TimeboxType>('input')
const selectedDuration = ref(45)
const customDialogOpen = ref(false)
const customMinutes = ref(60)
const errorMessage = ref('')
const showExtendOption = ref(false)
const hasRequestedNotification = ref(false)
const selectedTitle = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const preparedStrategies = reactive<Record<StrategyCategory, string[]>>({
  physical: [],
  cognitive: [],
  emotional: [],
})
const showDiscomfortDialog = ref(false)
const discomfortCategory = ref<StrategyCategory>('physical')
const discomfortSelections = reactive<Record<StrategyCategory, string[]>>({
  physical: [],
  cognitive: [],
  emotional: [],
})

const runtime = computed(() => sessions.runtime)
const currentSession = computed(() => sessions.currentSession)
const targetDurationSec = computed(() =>
  runtime.value.status === 'idle' ? selectedDuration.value * 60 : runtime.value.targetDurationSec,
)
const remainingSecondsDisplay = computed(() =>
  Math.max(0, targetDurationSec.value - timer.elapsed.value),
)
const remainingClock = computed(() => formatSecondsToClock(remainingSecondsDisplay.value))
const elapsedMinutes = computed(() => Math.floor(timer.elapsed.value / 60))
const elapsedClock = computed(() => formatSecondsToClock(timer.elapsed.value))
const targetMinutes = computed(() => Math.round(targetDurationSec.value / 60))
const recentTasks = computed(() => {
  const seen = new Set<string>()
  const items: string[] = []
  for (const box of [...timeboxes.timeboxes].reverse()) {
    if (box.title && !seen.has(box.title)) {
      seen.add(box.title)
      items.push(box.title)
      if (items.length >= 8) break
    }
  }
  return items
})
const strategyOptions = computed(() => settings.enabledStrategies)
const strategyLabels: Record<StrategyCategory, string> = {
  physical: '物理不适',
  cognitive: '认知不适',
  emotional: '情绪不适',
}
const currentStrategyList = computed<StrategyAction[]>(
  () => strategyOptions.value[discomfortCategory.value] ?? [],
)

const selectedStrategyItems = computed<Array<{ category: StrategyCategory; item: StrategyAction }>>(() => {
  const results: Array<{ category: StrategyCategory; item: StrategyAction }> = []
  ;(['physical', 'cognitive', 'emotional'] as StrategyCategory[]).forEach((category) => {
    const available = strategyOptions.value[category] ?? []
    discomfortSelections[category].forEach((id) => {
      const item = available.find((entry) => entry.id === id)
      if (item) {
        results.push({ category, item })
      }
    })
  })
  return results
})

const statusLabel = computed(() => {
  switch (runtime.value.status) {
    case 'idle':
      return '开始专注'
    case 'running':
      return '我感到不适'
    case 'paused':
      return '继续'
    case 'awaiting-review':
      return '休息开始'
    default:
      return '开始专注'
  }
})

const endTimeLabel = computed(() => {
  if (runtime.value.status === 'idle') return ''
  if (runtime.value.status === 'awaiting-review' && currentSession.value?.endEpoch) {
    return formatTime(new Date(currentSession.value.endEpoch))
  }
  if (!runtime.value.startEpoch) return ''
  const estimate = new Date(Date.now() + timer.remaining.value * 1000)
  return formatTime(estimate)
})

const progress = computed(() => timer.progress.value)
const circumference = 2 * Math.PI * 120
const dashOffset = computed(() => circumference * (1 - progress.value))

const urgeActive = computed(() => runtime.value.urgeBuffer.active)
const urgeRemaining = computed(() => {
  const seconds = runtime.value.urgeBuffer.remainingSec
  return formatSecondsToClock(seconds)
})

watch(
  () => runtime.value.status,
  (status) => {
    if (status === 'idle') {
      errorMessage.value = ''
      showExtendOption.value = false
      if (!runtime.value.timeboxId) {
        selectedTitle.value = ''
      }
      showDiscomfortDialog.value = false
      resetPrepared()
      focusTaskInput()
    }
    if (status === 'running') {
      selectedType.value = runtime.value.type
      const box = runtime.value.timeboxId ? timeboxes.getById(runtime.value.timeboxId) : undefined
      if (box?.title) {
        selectedTitle.value = box.title
      }
    }
    if (status !== 'running') {
      showDiscomfortDialog.value = false
    }
  },
  { immediate: true },
)

onMounted(() => {
  focusTaskInput()
})

watch(
  () => discomfort.lastAction,
  (action) => {
    if (!action) return
    if (runtime.value.status === 'running') {
      // Optionally provide hooks depending on action.kind in later steps
    }
  },
)

watch(
  () => timer.now.value,
  () => {
    if (runtime.value.urgeBuffer.active) {
      sessions.updateUrgeBuffer(timer.now.value)
    }
  },
)

watch(
  () => timer.remaining.value,
  (value) => {
    if (runtime.value.status === 'running' && value <= 0) {
      finalizeStop(true)
    }
  },
)

function findMatchingPlanned(now: Date, type: TimeboxType): Timebox | undefined {
  const dayBoxes = timeboxes.timeboxesForDate(now)
  const minute = now.getHours() * 60 + now.getMinutes()
  return dayBoxes.find((box) => {
    if (box.type !== type) return false
    if (box.status !== 'planned') return false
    const start = timeToMinutes(box.start)
    const end = timeToMinutes(box.end)
    return minute >= start && minute < end
  })
}

function chooseType(value: TimeboxType) {
  selectedType.value = value
}

function toggleDiscomfortSelection(category: StrategyCategory, id: string) {
  const list = discomfortSelections[category]
  const index = list.indexOf(id)
  if (index === -1) list.push(id)
  else list.splice(index, 1)
}

function setDiscomfortCategory(category: StrategyCategory) {
  discomfortCategory.value = category
}

function focusTaskInput() {
  requestAnimationFrame(() => {
    inputEl.value?.focus()
  })
}

function resetPrepared() {
  preparedStrategies.physical = []
  preparedStrategies.cognitive = []
  preparedStrategies.emotional = []
  discomfortSelections.physical = []
  discomfortSelections.cognitive = []
  discomfortSelections.emotional = []
}

function primeDiscomfortSelections() {
  discomfortSelections.physical = [...preparedStrategies.physical]
  discomfortSelections.cognitive = [...preparedStrategies.cognitive]
  discomfortSelections.emotional = [...preparedStrategies.emotional]
}

function openDiscomfortDialog() {
  if (!isRunning.value && !isPaused.value) {
    uiStore.openDiscomfortPanel()
    return
  }
  primeDiscomfortSelections()
  const firstAvailable =
    (['physical', 'cognitive', 'emotional'] as StrategyCategory[]).find(
      (category) => (strategyOptions.value[category] ?? []).length,
    ) || 'physical'
  discomfortCategory.value = firstAvailable
  showDiscomfortDialog.value = true
}

function closeDiscomfortDialog() {
  showDiscomfortDialog.value = false
}

function executeDiscomfortPlan() {
  const selections = selectedStrategyItems.value
  selections.forEach(({ category, item }) => {
    discomfort.setCategory(category)
    discomfort.runStrategy(item.id)
  })
  if (selections.length) {
    preparedStrategies.physical = [...discomfortSelections.physical]
    preparedStrategies.cognitive = [...discomfortSelections.cognitive]
    preparedStrategies.emotional = [...discomfortSelections.emotional]
  }
  closeDiscomfortDialog()
}

async function handleStart() {
  errorMessage.value = ''
  const now = new Date()
  const startTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const durationSec = selectedDuration.value * 60

  try {
    let target = findMatchingPlanned(now, selectedType.value)
    const fallbackTitle = selectedType.value === 'input' ? '输入练习' : '输出实践'
    let title = selectedTitle.value.trim()
    if (!target) {
      target = await timeboxes.create({
        date: now,
        start: startTime,
        duration: selectedDuration.value,
        type: selectedType.value,
        title: title || fallbackTitle,
        skipOverlapCheck: true,
      })
      title = target.title || fallbackTitle
    }
    title = title || target.title || fallbackTitle
    selectedTitle.value = title

    await timeboxes.update(target.id, { status: 'running', title })

    if (!hasRequestedNotification.value) {
      requestNotificationPermission()
      hasRequestedNotification.value = true
    }

    sessions.startSession({
      timeboxId: target.id,
      type: selectedType.value,
      durationSec,
    })
  } catch (error) {
    if (error instanceof Error && error.message === TITLE_NOT_ALLOWED_ERROR) {
      errorMessage.value = '任务标题不在学习禁区白名单内，已移至稍后清单。'
    } else {
      errorMessage.value = error instanceof Error ? error.message : '无法开始此时间盒'
    }
  }
}

function handlePause() {
  sessions.pauseSession()
}

function finalizeStop(auto = false) {
  sessions.stopSession()
  if (auto) {
    sendNotification('到点就停', {
      body: '本次时间盒结束，请填写三问产出。',
    })
    vibrate()
    playTone()
  }
  showDiscomfortDialog.value = false
}

async function handleFinalize(notes: { learned: string; stuck: string; next: string }, assets: string[]) {
  const session = currentSession.value
  const timeboxId = runtime.value.timeboxId
  if (!session || !timeboxId) return

  sessions.finalizeSession(notes, assets)
  await timeboxes.setStatus(timeboxId, 'done')

  const box = timeboxes.getById(timeboxId)
  if (box) {
    await timeboxes.ensurePairedOutput(box)
  }

  stats.recalculateFromSessions(sessions.sessions)
  showExtendOption.value = true
  selectedTitle.value = ''
}

async function handleCancel() {
  if (runtime.value.timeboxId) {
    await timeboxes.setStatus(runtime.value.timeboxId, 'planned')
  }
  sessions.cancelSession()
  stats.recalculateFromSessions(sessions.sessions)
  selectedTitle.value = ''
}

function openCustom() {
  customMinutes.value = selectedDuration.value
  customDialogOpen.value = true
}

function applyCustom() {
  const sanitized = Math.max(5, Math.min(120, Math.round(customMinutes.value)))
  selectedDuration.value = sanitized
  customDialogOpen.value = false
}

function closeCustom() {
  customDialogOpen.value = false
}

function triggerUrgeBuffer() {
  if (runtime.value.status !== 'running') return
  sessions.startUrgeBuffer(Date.now())
  showDiscomfortDialog.value = false
}

async function handleExtend() {
  const now = new Date()
  const start = minutesToTime(now.getHours() * 60 + now.getMinutes())
  try {
    await timeboxes.create({
      date: now,
      start,
      duration: 15,
      type: runtime.value.type,
      title: runtime.value.type === 'input' ? '输入延长 15 分钟' : '输出延长 15 分钟',
      skipOverlapCheck: true,
      skipWhitelistCheck: true,
    })
    showExtendOption.value = false
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '暂时无法延长'
  }
}

function handlePrimary() {
  switch (runtime.value.status) {
    case 'idle':
      handleStart()
      break
    case 'running':
      openDiscomfortDialog()
      break
    case 'paused':
      sessions.resumeSession()
      break
    case 'awaiting-review':
      // Focus review form handles submission
      break
    default:
      handleStart()
      break
  }
}

const isIdle = computed(() => runtime.value.status === 'idle')
const isRunning = computed(() => runtime.value.status === 'running')
const isPaused = computed(() => runtime.value.status === 'paused')
const awaitingReview = computed(
  () => runtime.value.status === 'awaiting-review' && currentSession.value !== undefined,
)
const isActiveSession = computed(() => isRunning.value || isPaused.value)

const typeLabel = computed(() =>
  runtime.value.status === 'idle'
    ? selectedType.value === 'input'
      ? '输入'
      : '输出'
    : runtime.value.type === 'input'
      ? '输入'
      : '输出',
)

const showControls = computed(() => !awaitingReview.value)
</script>

<template>
  <section class="timer-card" :class="{ 'timer-card--active': isActiveSession, 'timer-card--review': awaitingReview }">
    <div class="timer-card__header">
      <template v-if="isIdle">
        <div class="timer-card__intro">
          <h2>今天要学什么？</h2>
          <p>锁定主题，预设不适应对让注意力更稳。</p>
        </div>
        <label class="timer-card__task">
          <span>任务名称</span>
          <input
            ref="inputEl"
            v-model="selectedTitle"
            type="text"
            :disabled="!isIdle"
            maxlength="80"
            autocomplete="off"
            list="recent-task-options"
            placeholder="例如：Cursor 调试"
          />
        </label>
        <datalist id="recent-task-options">
          <option v-for="task in recentTasks" :key="task" :value="task" />
        </datalist>
        <div class="timer-card__mode-switch">
          <button
            v-for="option in typeOptions"
            :key="option.value"
            type="button"
            :class="[ 'timer-card__mode', { 'timer-card__mode--active': option.value === selectedType } ]"
            @click="isIdle ? chooseType(option.value) : null"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="timer-card__segments">
          <button
            v-for="option in durationOptions"
            :key="option"
            type="button"
            :class="[ 'timer-card__segment', { 'timer-card__segment--active': option === selectedDuration } ]"
            @click="isIdle ? (selectedDuration = option) : null"
          >
            {{ option }} 分
          </button>
          <button type="button" class="timer-card__segment timer-card__segment--wide" @click="isIdle ? openCustom() : null">
            自定义
          </button>
        </div>
      </template>
      <div class="timer-card__dial">
        <svg class="timer-card__svg" viewBox="0 0 280 280" role="presentation" aria-hidden="true">
          <circle class="timer-card__circle" cx="140" cy="140" r="120" />
          <circle
            class="timer-card__progress"
            cx="140"
            cy="140"
            r="120"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="dashOffset"
            :class="{ 'timer-card__progress--muted': urgeActive }"
          />
        </svg>
        <div class="timer-card__dial-content" :class="{ 'timer-card__dial-content--blur': urgeActive }">
          <span class="timer-card__clock timer-card__clock--primary">{{ remainingClock }}</span>
          <span class="timer-card__type">
            {{ typeLabel }}<span v-if="selectedTitle"> · {{ selectedTitle }}</span>
          </span>
          <span v-if="!isIdle" class="timer-card__progress-text">
            已专注 {{ elapsedClock }} / {{ targetMinutes }} 分
          </span>
        </div>

        <transition name="fade">
          <div v-if="urgeActive" class="timer-card__overlay">
            <p class="timer-card__overlay-text">
              已记录你的冲动，先专心 10 分钟；到点再决定。
            </p>
            <div class="timer-card__overlay-count">{{ urgeRemaining }}</div>
          </div>
        </transition>
      </div>
    </div>

    <div v-if="showControls" class="timer-card__actions">
      <button
        v-if="isIdle"
        class="timer-card__primary timer-card__primary--full"
        type="button"
        @click="handlePrimary"
      >
        {{ statusLabel }}
      </button>
      <div v-else class="timer-card__primary-group">
        <button type="button" class="timer-card__remind" @click="openDiscomfortDialog">
          我感到不适
        </button>
        <button
          v-if="isRunning"
          type="button"
          class="timer-card__primary timer-card__primary--secondary"
          @click="handlePause"
        >
          暂停
        </button>
        <button
          v-else
          type="button"
          class="timer-card__primary timer-card__primary--secondary"
          @click="sessions.resumeSession()"
        >
          继续
        </button>
      </div>

      <div v-if="isRunning" class="timer-card__meta">
        <span>到点就停 · {{ endTimeLabel }} 结束</span>
        <span>已投入 {{ elapsedMinutes }} 分</span>
      </div>

      <teleport to="body">
        <transition name="fade">
          <div v-if="showDiscomfortDialog" class="discomfort-dialog" role="dialog" aria-modal="true">
            <div class="discomfort-dialog__backdrop" @click="closeDiscomfortDialog" aria-hidden="true" />
            <div class="discomfort-dialog__panel">
              <header class="discomfort-dialog__header">
                <h3>识别你的不适感 👀</h3>
                <p>选择当前的状态，我们一起找到对策。</p>
              </header>
              <div class="discomfort-dialog__categories">
                <button
                  v-for="category in ['physical', 'cognitive', 'emotional']"
                  :key="category"
                  type="button"
                  :class="[
                    'discomfort-dialog__category',
                    { 'discomfort-dialog__category--active': discomfortCategory === category },
                  ]"
                  @click="setDiscomfortCategory(category as StrategyCategory)"
                >
                  {{ strategyLabels[category as StrategyCategory] }}
                </button>
              </div>
              <div class="discomfort-dialog__list">
                <label
                  v-for="item in currentStrategyList"
                  :key="item.id"
                  class="discomfort-dialog__item"
                >
                  <input
                    type="checkbox"
                    :checked="discomfortSelections[discomfortCategory].includes(item.id)"
                    @change="toggleDiscomfortSelection(discomfortCategory, item.id)"
                  />
                  <span>{{ item.label }}</span>
                </label>
                <p v-if="!currentStrategyList.length" class="discomfort-dialog__empty">
                  暂无预设策略，可在设置中添加。
                </p>
              </div>
              <div v-if="selectedStrategyItems.length" class="discomfort-dialog__summary">
                <h4>建议的应对方式</h4>
                <ul>
                  <li v-for="item in selectedStrategyItems" :key="item.item.id">
                    {{ strategyLabels[item.category] }} · {{ item.item.label }}<span v-if="item.item.description"> —— {{ item.item.description }}</span>
                  </li>
                </ul>
              </div>
              <div class="discomfort-dialog__actions">
                <button
                  type="button"
                  class="discomfort-dialog__primary"
                  :disabled="!selectedStrategyItems.length"
                  @click="executeDiscomfortPlan"
                >
                  执行方案并继续专注
                </button>
                <button type="button" class="discomfort-dialog__ghost" @click="() => { triggerUrgeBuffer(); closeDiscomfortDialog() }">
                  10 分钟后再决定
                </button>
                <button type="button" class="discomfort-dialog__danger" @click="() => { finalizeStop(); closeDiscomfortDialog() }">
                  仍然想结束
                </button>
                <button type="button" class="discomfort-dialog__cancel" @click="closeDiscomfortDialog">
                  继续专注
                </button>
              </div>
            </div>
          </div>
        </transition>
      </teleport>

      
    </div>

    <div v-if="awaitingReview && currentSession" class="timer-card__review">
      <FocusReviewForm :session="currentSession" @submit="handleFinalize" />
      <div class="timer-card__review-footer">
        <button type="button" class="timer-card__ghost timer-card__review-action" @click="handleCancel">
          重新开始
        </button>
        <button
          v-if="showExtendOption"
          type="button"
          class="timer-card__ghost timer-card__ghost--primary timer-card__review-action"
          @click="handleExtend"
        >
          +15 分钟新盒子
        </button>
      </div>
    </div>

    <p v-if="endTimeLabel && !awaitingReview && showControls" class="timer-card__end">{{ endTimeLabel }} 结束</p>

    <p v-if="errorMessage" class="timer-card__error">{{ errorMessage }}</p>

    <dialog v-if="customDialogOpen" class="timer-card__dialog" open>
      <form @submit.prevent="applyCustom">
        <header class="timer-card__dialog-head">
          <h3>自定义专注时长</h3>
          <p>范围 5 – 120 分钟。</p>
        </header>
        <div class="timer-card__dialog-field">
          <label>分钟
            <input v-model.number="customMinutes" type="number" min="5" max="120" step="5" />
          </label>
        </div>
        <div class="timer-card__dialog-actions">
          <button type="button" @click="closeCustom">取消</button>
          <button type="submit">确定</button>
        </div>
      </form>
    </dialog>
  </section>
</template>

<style scoped>
.timer-card {
  background: var(--surface-raised);
  border-radius: var(--radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-card);
  display: grid;
  gap: 16px;
  justify-items: center;
  position: relative;
}

 .timer-card__header {
  width: 100%;
  display: grid;
  gap: 12px;
}

.timer-card__intro {
  display: grid;
  gap: 4px;
}

.timer-card__intro h2 {
  margin: 0;
  font-size: 18px;
}

.timer-card__intro p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.timer-card__task {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.timer-card__task input {
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 15px;
}

.timer-card__task input:disabled {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  cursor: not-allowed;
}

.timer-card--active {
  gap: 16px;
}

.timer-card--active .timer-card__dial {
  width: min(280px, 60vw);
  height: min(280px, 60vw);
  margin: 16px auto;
}

.timer-card--active .timer-card__clock--primary {
  font-size: clamp(24px, 6.4vw, 38px);
}

.timer-card__segments {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}

.timer-card__segment {
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 8px 0;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.timer-card__segment--active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.timer-card__segment--wide {
  min-width: 80px;
}

.timer-card__mode-switch {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(80px, 1fr);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  padding: 4px;
  width: 100%;
}

.timer-card__mode {
  border: none;
  border-radius: 999px;
  padding: 6px 0;
  font-weight: 600;
  background: transparent;
}

.timer-card__mode--active {
  background: var(--color-primary);
  color: #fff;
}

.timer-card__segment--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.timer-card__dial {
  position: relative;
  width: min(240px, 64vw);
  height: min(240px, 64vw);
  margin: 16px auto;
  display: grid;
  place-items: center;
}

.timer-card__svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.timer-card__circle {
  fill: none;
  stroke: color-mix(in srgb, var(--color-primary) 12%, transparent);
  stroke-width: 14px;
}

.timer-card__progress {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 14px;
  stroke-linecap: round;
  transition: stroke-dashoffset 160ms ease-out, stroke 160ms ease-out, opacity 160ms ease-out;
}

.timer-card__progress--muted {
  stroke: color-mix(in srgb, var(--color-primary) 35%, transparent);
  opacity: 0.7;
}

.timer-card__dial-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  transition: filter 160ms ease-out, opacity 160ms ease-out;
}

.timer-card__dial-content--blur {
  filter: blur(2px);
  opacity: 0.4;
}

.timer-card__type {
  font-size: 16px;
  font-weight: 600;
}

.timer-card__clock {
  font-size: 18px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.timer-card__clock--primary {
  font-size: clamp(38px, 8.8vw, 60px);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.timer-card__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(12, 21, 34, 0.56);
  color: #fff;
  border-radius: 50%;
  padding: 24px;
  text-align: center;
}

.timer-card__overlay-text {
  margin: 0;
  font-size: 14px;
}

.timer-card__overlay-count {
  font-size: 40px;
  font-family: var(--font-mono);
  font-weight: 700;
}

.timer-card__urge-confirm {
  width: 100%;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: center;
  display: grid;
  gap: 12px;
}

.timer-card__urge-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.timer-card__urge-actions button {
  border-radius: 12px;
  border: none;
  padding: 8px 16px;
  font-weight: 600;
}

.timer-card__urge-actions button:last-child {
  background: #d93025;
  color: #fff;
}

.timer-card__urge-actions button:first-child {
  background: #ffffff;
  color: var(--text-primary);
}

.timer-card__actions {
  width: 100%;
  display: grid;
  gap: 16px;
}

.timer-card__primary {
  border: none;
  border-radius: 999px;
  padding: 16px;
  background: var(--color-primary);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  width: 100%;
}

.timer-card__remind {
  border: none;
  border-radius: 999px;
  padding: 16px;
  background: linear-gradient(135deg, #ffb3b3, #ff6b6b);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  width: 100%;
}

.timer-card__primary-group {
  display: grid;
  width: 100%;
  gap: 10px;
}

.timer-card__primary--secondary {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
}

.timer-card__primary--full {
  width: 100%;
}

.timer-card__secondary {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.timer-card__ghost {
  border-radius: 999px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  padding: 8px 18px;
  font-weight: 600;
}

.timer-card__ghost--primary {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.timer-card__review-footer {
  width: 100%;
  display: grid;
  gap: 12px;
}

.timer-card__review-action {
  width: 100%;
  padding: 12px 18px;
  font-size: 15px;
  text-align: center;
}

.timer-card__dialog {
  border: none;
  padding: 0;
  border-radius: 24px;
  width: min(360px, 92vw);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card, 0 18px 45px rgba(12, 21, 34, 0.18));
}

.timer-card__dialog::backdrop {
  background: rgba(8, 16, 28, 0.45);
  backdrop-filter: blur(2px);
}

.timer-card__dialog form {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.timer-card__dialog-head h3 {
  margin: 0;
  font-size: 20px;
}

.timer-card__dialog-head p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.timer-card__dialog-field {
  display: grid;
  gap: 8px;
}

.timer-card__dialog-field label {
  display: grid;
  gap: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.timer-card__dialog-field input {
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 16px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.timer-card__dialog-field input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.timer-card__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.timer-card__dialog-actions button {
  border-radius: 999px;
  padding: 10px 20px;
  font-weight: 600;
  cursor: pointer;
}

.timer-card__dialog-actions button[type='button'] {
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-muted);
}

.timer-card__dialog-actions button[type='button']:hover {
  color: var(--text-primary);
}

.timer-card__dialog-actions button[type='submit'] {
  border: none;
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 12px 24px rgba(15, 98, 254, 0.24);
}

.timer-card__dialog-actions button[type='submit']:hover {
  filter: brightness(1.05);
}

.timer-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
}

.discomfort-dialog {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  z-index: 60;
}

.discomfort-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(8, 16, 28, 0.4);
}

.discomfort-dialog__panel {
  position: relative;
  z-index: 1;
  width: min(480px, 94vw);
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 22px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-subtle);
}

.discomfort-dialog__header h3 {
  margin: 0;
  font-size: 20px;
}

.discomfort-dialog__header p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.discomfort-dialog__categories {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.discomfort-dialog__category {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
  background: transparent;
  font-weight: 600;
}

.discomfort-dialog__category--active {
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.discomfort-dialog__list {
  display: grid;
  gap: 8px;
}

.discomfort-dialog__item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.discomfort-dialog__item input {
  width: 16px;
  height: 16px;
}

.discomfort-dialog__empty {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.discomfort-dialog__summary {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: 14px;
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}

.discomfort-dialog__summary h4 {
  margin: 0;
  font-size: 14px;
}

.discomfort-dialog__summary ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  font-size: 13px;
}

.discomfort-dialog__actions {
  display: grid;
  gap: 10px;
}

.discomfort-dialog__primary {
  border: none;
  border-radius: 999px;
  padding: 10px 16px;
  background: var(--color-primary);
  color: #fff;
  font-weight: 700;
}

.discomfort-dialog__primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.discomfort-dialog__ghost {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 10px;
  background: transparent;
  font-weight: 600;
}

.discomfort-dialog__danger {
  border-radius: 12px;
  border: 1px solid #d93025;
  padding: 10px;
  background: transparent;
  color: #d93025;
  font-weight: 600;
}

.discomfort-dialog__cancel {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-weight: 600;
}
</style>
