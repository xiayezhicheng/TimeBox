<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DurationSelector from './DurationSelector.vue'
import FocusReviewForm from './FocusReviewForm.vue'
import { useSessionsStore } from '../../stores/sessions'
import { useTimeboxStore } from '../../stores/timeboxes'
import { useStatsStore } from '../../stores/stats'
import { useDiscomfortStore } from '../../stores/discomfort'
import { useUIStore } from '../../stores/ui'
import { useSessionTimer } from '../../composables/useSessionTimer'
import type { Timebox, TimeboxType } from '../../types/models'
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
const stats = useStatsStore()
const discomfort = useDiscomfortStore()
const uiStore = useUIStore()
const timer = useSessionTimer()

const typeOptions: { label: string; value: TimeboxType }[] = [
  { label: '输入', value: 'input' },
  { label: '输出', value: 'output' },
]
const durationOptions = [10, 30, 45, 60]

const selectedType = ref<TimeboxType>('input')
const selectedDuration = ref(45)
const customDialogOpen = ref(false)
const customMinutes = ref(60)
const errorMessage = ref('')
const showUrgeConfirm = ref(false)
const showExtendOption = ref(false)
const hasRequestedNotification = ref(false)
const selectedTitle = ref('')

const runtime = computed(() => sessions.runtime)
const currentSession = computed(() => sessions.currentSession)
const remainingClock = computed(() => formatSecondsToClock(timer.remaining.value))
const elapsedMinutes = computed(() => Math.floor(timer.elapsed.value / 60))

const statusLabel = computed(() => {
  switch (runtime.value.status) {
    case 'idle':
      return '开始专注'
    case 'running':
      return '结束'
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
const urgeRemaining = computed(() => runtime.value.urgeBuffer.remainingSec)

watch(
  () => runtime.value.status,
  (status) => {
    if (status === 'idle') {
      errorMessage.value = ''
      showExtendOption.value = false
      if (!runtime.value.timeboxId) {
        selectedTitle.value = ''
      }
    }
    if (status === 'running') {
      selectedType.value = runtime.value.type
      const box = runtime.value.timeboxId ? timeboxes.getById(runtime.value.timeboxId) : undefined
      if (box?.title) {
        selectedTitle.value = box.title
      }
    }
    if (status !== 'running') {
      showUrgeConfirm.value = false
    }
  },
  { immediate: true },
)

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
      const remaining = sessions.updateUrgeBuffer(timer.now.value)
      if (remaining <= 0 && !showUrgeConfirm.value) {
        showUrgeConfirm.value = true
      }
    }
  },
)

watch(
  () => timer.remaining.value,
  (value) => {
    if (runtime.value.status === 'running' && value <= 0) {
      handleStop(true)
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
    errorMessage.value = error instanceof Error ? error.message : '无法开始此时间盒'
  }
}

function handlePause() {
  sessions.pauseSession()
}

function handleStop(auto = false) {
  sessions.stopSession()
  if (auto) {
    sendNotification('到点就停', {
      body: '本次时间盒结束，请填写三问产出。',
    })
    vibrate()
    playTone()
  }
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
  const sanitized = Math.max(10, Math.min(180, Math.round(customMinutes.value)))
  selectedDuration.value = sanitized
  customDialogOpen.value = false
}

function closeCustom() {
  customDialogOpen.value = false
}

function triggerUrgeBuffer() {
  if (runtime.value.status !== 'running') return
  sessions.startUrgeBuffer(Date.now())
  showUrgeConfirm.value = false
}

function handleUrgeStay() {
  sessions.recordUrgeDelay('stayed')
  stats.incrementTenMinRule()
  sessions.resetUrgeBuffer()
  showUrgeConfirm.value = false
}

function handleUrgeLeave() {
  sessions.recordUrgeDelay('left')
  stats.incrementTenMinRule()
  sessions.resetUrgeBuffer()
  showUrgeConfirm.value = false
  handleStop()
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
      handleStop()
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
    <div class="timer-card__header" v-if="isIdle">
      <label class="timer-card__task">
        <span>当前任务</span>
        <input
          v-model="selectedTitle"
          type="text"
          :disabled="!isIdle"
          maxlength="80"
          placeholder="输入本次时间盒的任务"
        />
      </label>
      <div class="timer-card__segments">
        <button
          v-for="option in typeOptions"
          :key="option.value"
          type="button"
          :class="[
            'timer-card__segment',
            {
              'timer-card__segment--active': option.value === (runtime.status === 'idle' ? selectedType : runtime.type),
              'timer-card__segment--disabled': runtime.status !== 'idle',
            },
          ]"
          @click="isIdle ? chooseType(option.value) : null"
        >
          {{ option.label }}
        </button>
      </div>
      <DurationSelector
        v-model="selectedDuration"
        :options="durationOptions"
        :disabled="!isIdle"
        @custom="openCustom"
      />
    </div>

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
        />
      </svg>
      <div class="timer-card__dial-content">
        <span class="timer-card__clock timer-card__clock--primary">{{ remainingClock }}</span>
        <span class="timer-card__type">{{ typeLabel }}</span>
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

    <transition name="fade">
      <div v-if="showUrgeConfirm" class="timer-card__urge-confirm" role="alertdialog">
        <p>仍要离开？</p>
        <div class="timer-card__urge-actions">
          <button type="button" @click="handleUrgeStay">继续专注</button>
          <button type="button" @click="handleUrgeLeave">仍要离开</button>
        </div>
      </div>
    </transition>

    <div v-if="showControls" class="timer-card__actions">
      <div class="timer-card__primary-group" v-if="isRunning || isPaused">
        <button type="button" class="timer-card__primary" @click="handleStop()">
          结束
        </button>
        <button
          type="button"
          class="timer-card__primary timer-card__primary--secondary"
          @click="isPaused ? sessions.resumeSession() : handlePause()"
        >
          {{ isPaused ? '继续' : '暂停' }}
        </button>
      </div>
      <button
        v-else
        class="timer-card__primary timer-card__primary--full"
        type="button"
        @click="handlePrimary"
      >
        {{ statusLabel }}
      </button>

      <div v-if="isRunning || isPaused" class="timer-card__secondary">
        <button type="button" class="timer-card__ghost" :disabled="urgeActive" @click="triggerUrgeBuffer">
          +10 分钟后再说
        </button>
        <button type="button" class="timer-card__ghost" @click="uiStore.openDiscomfortPanel()">
          不适应对
        </button>
      </div>

      <div v-if="isRunning" class="timer-card__meta">
        <span>到点就停 · {{ endTimeLabel }} 结束</span>
        <span>已投入 {{ elapsedMinutes }} 分</span>
      </div>
    </div>

    <div v-if="awaitingReview && currentSession" class="timer-card__review">
      <FocusReviewForm :session="currentSession" @submit="handleFinalize" />
      <div class="timer-card__review-footer">
        <button type="button" class="timer-card__ghost" @click="handleCancel">重新开始</button>
        <button
          v-if="showExtendOption"
          type="button"
          class="timer-card__ghost timer-card__ghost--primary"
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
        <h3>自定义专注时长</h3>
        <p>范围 10 – 180 分钟。</p>
        <input v-model.number="customMinutes" type="number" min="10" max="180" step="5" />
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
  padding: 24px;
  box-shadow: var(--shadow-card);
  display: grid;
  gap: 20px;
  justify-items: center;
  position: relative;
}

.timer-card__header {
  width: 100%;
  display: grid;
  gap: 16px;
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
  padding: 10px 12px;
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
  width: min(340px, 70vw);
  height: min(340px, 70vw);
}

.timer-card--active .timer-card__clock--primary {
  font-size: clamp(58px, 12vw, 92px);
}

.timer-card__segments {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.timer-card__segment {
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 10px 18px;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
}

.timer-card__segment--active {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.timer-card__segment--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.timer-card__dial {
  position: relative;
  width: min(300px, 80vw);
  height: min(300px, 80vw);
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
  transition: stroke-dashoffset 160ms ease-out;
}

.timer-card__dial-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
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
  font-size: clamp(48px, 11vw, 76px);
  font-weight: 700;
  color: var(--text-primary);
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
  font-size: 24px;
  font-family: var(--font-mono);
}

.timer-card__urge-confirm {
  width: 100%;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border-radius: var(--radius-md);
  padding: 16px;
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

.timer-card__primary-group {
  display: grid;
  width: 100%;
  gap: 12px;
}

.timer-card__primary--secondary {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
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

.timer-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
}

.timer-card__review {
  width: 100%;
  display: grid;
  gap: 20px;
}

.timer-card__review-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.timer-card__end {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.timer-card__error {
  margin: 0;
  color: #d93025;
  font-size: 13px;
}

.timer-card__dialog {
  border: none;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--shadow-card);
}

.timer-card__dialog form {
  display: grid;
  gap: 12px;
}

.timer-card__dialog input {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
}

.timer-card__dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 160ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .timer-card {
    padding: 32px;
    gap: 24px;
  }

  .timer-card__meta {
    font-size: 14px;
  }
}
</style>
