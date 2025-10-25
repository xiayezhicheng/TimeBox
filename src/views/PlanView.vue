<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import PlanCreateDialog from '../components/plan/PlanCreateDialog.vue'
import { useTimeboxStore } from '../stores/timeboxes'
import { useSettingsStore } from '../stores/settings'
import type { Timebox } from '../types/models'
import {
  formatDateTitle,
  minutesToTime,
  timeToMinutes,
  toDateKey,
} from '../utils/datetime'

const SLOT_MINUTES = 30
const VIEW_START_MINUTES = 8 * 60
const VIEW_END_MINUTES = 26 * 60
const VISIBLE_MINUTES = VIEW_END_MINUTES - VIEW_START_MINUTES
const DAY_MINUTES = 24 * 60

const timeboxes = useTimeboxStore()
const settings = useSettingsStore()

const mode = ref<'day' | 'week'>('day')
const selectedDate = ref(new Date())
const selection = reactive({ active: false, start: 0, end: 0 })
const dialogOpen = ref(false)
const dialogData = reactive({ start: 0, end: 0, type: 'input' as 'input' | 'output' })
const message = ref('')
const slotsRef = ref<HTMLElement | null>(null)
const activePointer = ref<number | null>(null)

const dayBoxes = computed(() => timeboxes.timeboxesForDate(selectedDate.value))

const sortedDayBoxes = computed(() =>
  [...dayBoxes.value].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start)),
)
const visibleHours = computed(() => {
  const startHour = VIEW_START_MINUTES / 60
  const endHour = VIEW_END_MINUTES / 60
  return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
})

const selectionStyle = computed(() => {
  if (!selection.active) return null
  const start = Math.min(selection.start, selection.end)
  const end = Math.max(selection.start, selection.end)
  const extendedStart = toExtendedMinutes(start)
  const extendedEnd = toExtendedMinutes(end)
  const clampedStart = Math.min(Math.max(extendedStart, VIEW_START_MINUTES), VIEW_END_MINUTES)
  const clampedEnd = Math.min(Math.max(extendedEnd, VIEW_START_MINUTES), VIEW_END_MINUTES)
  const visibleSpan = Math.max(clampedEnd - clampedStart, SLOT_MINUTES / 2)
  const top = ((clampedStart - VIEW_START_MINUTES) / VISIBLE_MINUTES) * 100
  const height = (visibleSpan / VISIBLE_MINUTES) * 100
  return {
    top: `${top}%`,
    height: `${height}%`,
  }
})

const weekStart = computed(() => startOfWeek(selectedDate.value))
const weekDays = computed(() =>
  Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.value)
    date.setDate(weekStart.value.getDate() + index)
    return date
  }),
)

function startOfWeek(date: Date): Date {
  const copy = new Date(date)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function minutesFromPointer(event: PointerEvent): number {
  const el = slotsRef.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  const offset = event.clientY - rect.top
  const ratio = Math.max(0, Math.min(1, offset / rect.height))
  const viewMinutes =
    Math.round((ratio * VISIBLE_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES + VIEW_START_MINUTES
  const clamped = Math.max(VIEW_START_MINUTES, Math.min(VIEW_END_MINUTES, viewMinutes))
  const dayMinutes = clamped >= DAY_MINUTES ? clamped - DAY_MINUTES : clamped
  return dayMinutes
}

function handlePointerDown(event: PointerEvent) {
  if (!slotsRef.value) return
  slotsRef.value.setPointerCapture(event.pointerId)
  activePointer.value = event.pointerId
  const minute = minutesFromPointer(event)
  selection.active = true
  selection.start = minute
  selection.end = minute + SLOT_MINUTES
}

function handlePointerMove(event: PointerEvent) {
  if (!selection.active) return
  selection.end = minutesFromPointer(event)
}

function handlePointerUp(_event: PointerEvent) {
  if (slotsRef.value && activePointer.value !== null) {
    slotsRef.value.releasePointerCapture(activePointer.value)
  }
  activePointer.value = null
  if (!selection.active) return
  const start = Math.min(selection.start, selection.end)
  const end = Math.max(selection.start, selection.end)
  const duration = Math.max(SLOT_MINUTES, end - start || SLOT_MINUTES)

  dialogData.start = start
  dialogData.end = Math.min(start + duration, DAY_MINUTES)
  dialogData.type = 'input'
  selection.active = false
  dialogOpen.value = true
}

function handlePointerCancel(_event?: PointerEvent) {
  if (slotsRef.value && activePointer.value !== null) {
    slotsRef.value.releasePointerCapture(activePointer.value)
  }
  activePointer.value = null
  selection.active = false
}

async function handleDialogSubmit(payload: {
  title: string
  type: 'input' | 'output'
  duration: number
  autoPair: boolean
}) {
  dialogOpen.value = false
  const duration = Math.max(30, Math.round(payload.duration / 15) * 15)
  const title = payload.title.trim()

  if (!passesWhitelist(title)) {
    await timeboxes.addLaterItem(title || `${payload.type === 'input' ? '输入' : '输出'}任务`, payload.type)
    message.value = '标题不在本月主题内，已记入稍后清单。'
    window.setTimeout(() => {
      message.value = ''
    }, 4000)
    return
  }

  try {
    await timeboxes.create({
      date: selectedDate.value,
      start: minutesToTime(dialogData.start),
      duration,
      type: payload.type,
      title,
      autoPair: payload.autoPair,
    })
    message.value = '已加入计划。'
    window.setTimeout(() => {
      message.value = ''
    }, 3000)
  } catch (error) {
    message.value = error instanceof Error ? error.message : '创建时间盒失败'
    window.setTimeout(() => {
      message.value = ''
    }, 4000)
  }
}

function passesWhitelist(title: string): boolean {
  if (!title) return true
  const tags = settings.settings.themeTags
  if (!tags.length) return true
  const lowered = title.toLowerCase()
  return tags.some((tag) => lowered.includes(tag.toLowerCase()))
}

function changeDay(offset: number) {
  const next = new Date(selectedDate.value)
  next.setDate(selectedDate.value.getDate() + offset)
  selectedDate.value = next
}

function goToday() {
  selectedDate.value = new Date()
}

function boxStyle(box: Timebox) {
  const rawStart = timeToMinutes(box.start)
  const rawEnd = timeToMinutes(box.end)
  const extendedStart = toExtendedMinutes(rawStart)
  const extendedEnd =
    rawEnd < rawStart ? toExtendedMinutes(rawEnd + DAY_MINUTES) : toExtendedMinutes(rawEnd)
  const clampedStart = Math.max(extendedStart, VIEW_START_MINUTES)
  const clampedEnd = Math.min(extendedEnd, VIEW_END_MINUTES)
  if (clampedEnd <= VIEW_START_MINUTES || clampedStart >= VIEW_END_MINUTES) {
    return { display: 'none' }
  }
  const top = ((clampedStart - VIEW_START_MINUTES) / VISIBLE_MINUTES) * 100
  const height = Math.max(((clampedEnd - clampedStart) / VISIBLE_MINUTES) * 100, 1)
  return {
    top: `${top}%`,
    height: `${height}%`,
  }
}

function statusLabel(box: Timebox) {
  switch (box.status) {
    case 'planned':
      return '计划'
    case 'running':
      return '进行中'
    case 'done':
      return '已完成'
    case 'skipped':
      return '已跳过'
    default:
      return ''
  }
}

function weekBoxesFor(date: Date) {
  return timeboxes.timeboxesForDate(date)
}

const laterList = computed(() => timeboxes.laterList)

function hourLabel(hour: number): string {
  if (hour < 24) {
    return `${hour.toString().padStart(2, '0')}:00`
  }
  const wrapped = hour - 24
  return `${wrapped.toString().padStart(2, '0')}:00`
}

function toExtendedMinutes(minutes: number): number {
  return minutes < VIEW_START_MINUTES ? minutes + DAY_MINUTES : minutes
}
</script>

<template>
  <div class="plan">
    <header class="plan__header">
      <div>
        <h1>计划</h1>
        <p class="plan__subtitle">时间盒子日程，输入输出成对安排</p>
      </div>
      <div class="plan__mode">
        <button
          type="button"
          class="plan__mode-btn"
          :class="{ 'plan__mode-btn--active': mode === 'day' }"
          @click="mode = 'day'"
        >
          日视图
        </button>
        <button
          type="button"
          class="plan__mode-btn"
          :class="{ 'plan__mode-btn--active': mode === 'week' }"
          @click="mode = 'week'"
        >
          周视图
        </button>
      </div>
    </header>

    <section class="plan__toolbar">
      <button type="button" @click="changeDay(-1)">前一天</button>
      <span>{{ formatDateTitle(selectedDate) }}</span>
      <button type="button" @click="changeDay(1)">后一天</button>
      <button type="button" class="plan__today" @click="goToday">今天</button>
    </section>

    <section v-if="mode === 'day'" class="plan-day">
      <div class="plan-day__timeline">
        <span v-for="hour in visibleHours" :key="hour" class="plan-day__tick">
          {{ hourLabel(hour) }}
        </span>
      </div>
      <div
        ref="slotsRef"
        class="plan-day__slots"
        @pointerdown.prevent="handlePointerDown"
        @pointermove.prevent="handlePointerMove"
        @pointerup.prevent="handlePointerUp"
        @pointercancel.prevent="handlePointerCancel"
        @pointerleave.prevent="handlePointerCancel"
        role="presentation"
      >
        <div v-if="selectionStyle" class="plan-day__selection" :style="selectionStyle" />
        <article
          v-for="box in sortedDayBoxes"
          :key="box.id"
          class="plan-day__box"
          :data-type="box.type"
          :style="boxStyle(box)"
        >
          <header>
            <span class="plan-day__range">{{ timeboxes.formatRange(box) }}</span>
            <span class="plan-day__title">
              {{ box.title || (box.type === 'input' ? '输入练习' : '输出实践') }}
            </span>
            <span class="plan-day__status">{{ statusLabel(box) }}</span>
          </header>
        </article>
      </div>
    </section>

    <section v-else class="plan-week">
      <article v-for="day in weekDays" :key="toDateKey(day)" class="plan-week__day">
        <header>
          <h3>{{ formatDateTitle(day) }}</h3>
          <span>{{ weekBoxesFor(day).length }} 盒</span>
        </header>
        <ul>
          <li v-for="box in weekBoxesFor(day)" :key="box.id" :data-type="box.type">
            <span>{{ timeboxes.formatRange(box) }}</span>
            <span>{{ box.title || (box.type === 'input' ? '输入练习' : '输出实践') }}</span>
          </li>
        </ul>
      </article>
    </section>

    <section class="plan__later" v-if="laterList.length">
      <h2>稍后清单</h2>
      <ul>
        <li v-for="item in laterList" :key="item.id">
          <span>{{ item.title }}</span>
          <span>{{ item.type === 'input' ? '输入' : '输出' }}</span>
          <time>{{ new Date(item.createdAt).toLocaleString() }}</time>
        </li>
      </ul>
    </section>

    <p v-if="message" class="plan__message">{{ message }}</p>

    <PlanCreateDialog
      :open="dialogOpen"
      :date="selectedDate"
      :start-minutes="dialogData.start"
      :end-minutes="dialogData.end"
      :initial-type="dialogData.type"
      @cancel="dialogOpen = false"
      @submit="handleDialogSubmit"
    />
  </div>
</template>

<style scoped>
.plan {
  padding: 24px 20px 80px;
  display: grid;
  gap: 24px;
}

.plan__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.plan__subtitle {
  margin: 0;
  color: var(--text-muted);
}

.plan__mode {
  display: inline-flex;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.plan__mode-btn {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
}

.plan__mode-btn--active {
  background: var(--color-primary);
  color: #fff;
}

.plan__toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.plan__toolbar button {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  padding: 8px 12px;
}

.plan__today {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.plan-day {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
}

.plan-day__timeline {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 1008px;
  color: var(--text-muted);
  font-size: 12px;
}

.plan-day__tick {
  display: block;
}

.plan-day__slots {
  position: relative;
  border-radius: 16px;
  background: repeating-linear-gradient(
      to bottom,
      rgba(15, 34, 67, 0.06),
      rgba(15, 34, 67, 0.06) 1px,
      transparent 1px,
      transparent 28px
    ),
    #fff;
  border: 1px solid var(--border-subtle);
  height: 1008px;
  overflow: hidden;
}

.plan-day__selection {
  position: absolute;
  left: 8px;
  right: 8px;
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
  border: 1px dashed var(--color-primary);
  border-radius: 12px;
}

.plan-day__box {
  position: absolute;
  left: 8px;
  right: 8px;
  border-radius: 14px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  background: rgba(15, 98, 254, 0.86);
}

.plan-day__box[data-type='output'] {
  background: rgba(55, 158, 116, 0.9);
}

.plan-day__box header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 6px;
  font-size: 12px;
}

.plan-day__range {
  font-weight: 700;
  font-size: 12px;
}

.plan-day__title {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-day__status {
  font-size: 12px;
}

.plan-week {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.plan-week__day {
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  background: #fff;
  padding: 16px;
  display: grid;
  gap: 12px;
}

.plan-week__day header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plan-week__day ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.plan-week__day li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.plan-week__day li[data-type='output'] {
  background: color-mix(in srgb, #2dac78 12%, transparent);
}

.plan__later {
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--border-subtle);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.plan__later h2 {
  margin: 0;
}

.plan__later ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.plan__later li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
}

.plan__message {
  margin: 0;
  color: var(--color-primary);
  font-size: 13px;
}

@media (min-width: 1025px) {
  .plan {
    padding: 32px 32px 64px;
    gap: 32px;
  }

  .plan-day__timeline {
    font-size: 13px;
  }
}
</style>
