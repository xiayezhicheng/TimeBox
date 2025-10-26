import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { LaterItem, Timebox, TimeboxType } from '../types/models'
import { diffMinutes, minutesToTime, nextDay, timeToMinutes, toDateKey, fromDateKey } from '../utils/datetime'
import { createId } from '../utils/id'
import { useSettingsStore } from './settings'
import {
  loadLaterList,
  loadTimeboxes,
  saveLaterList,
  saveTimeboxes,
} from '../services/storage'

export interface CreateTimeboxInput {
  date: Date
  start: string
  duration: number
  type: TimeboxType
  title?: string
  autoPair?: boolean
  pairedFromId?: string
  skipOverlapCheck?: boolean
  skipWhitelistCheck?: boolean
}

const DAY_MINUTES = 24 * 60
const MIN_GAP_MINUTES = 15
const DEFAULT_PAIR_START_MIN = 9 * 60

const sortByStart = (a: Timebox, b: Timebox) => timeToMinutes(a.start) - timeToMinutes(b.start)

export const TITLE_NOT_ALLOWED_ERROR = 'TITLE_NOT_ALLOWED' as const

export const useTimeboxStore = defineStore('timeboxes', () => {
  const timeboxes = ref<Timebox[]>([])
  const laterList = ref<LaterItem[]>([])
  const ready = ref(false)

  async function bootstrap() {
    if (ready.value) return
    timeboxes.value = await loadTimeboxes()
    laterList.value = await loadLaterList()
    ready.value = true
  }

  const timeboxesByDate = computed(() => {
    const map: Record<string, Timebox[]> = {}
    for (const box of timeboxes.value) {
      const bucket = map[box.date] ?? (map[box.date] = [])
      bucket.push(box)
    }
    Object.values(map).forEach((list) => list.sort(sortByStart))
    return map
  })

  const upcomingPlanned = computed(() =>
    [...timeboxes.value]
      .filter((box) => box.status === 'planned')
      .sort((a, b) => {
        if (a.date === b.date) return sortByStart(a, b)
        return a.date.localeCompare(b.date)
      }),
  )

  function timeboxesForDate(date: Date): Timebox[] {
    return timeboxesByDate.value[toDateKey(date)]?.slice() ?? []
  }

  function timeboxesForRange(startDate: Date, days: number): Timebox[] {
    const items: Timebox[] = []
    for (let i = 0; i < days; i += 1) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      items.push(...timeboxesForDate(date))
    }
    return items
  }

  function getById(id: string): Timebox | undefined {
    return timeboxes.value.find((box) => box.id === id)
  }

  function durationOf(box: Timebox): number {
    return diffMinutes(box.start, box.end)
  }

  function formatRange(box: Timebox): string {
    return `${box.start} - ${box.end}`
  }

  async function create(input: CreateTimeboxInput): Promise<Timebox> {
    const dateKey = toDateKey(input.date)
    if (!input.skipOverlapCheck && detectOverlap(dateKey, input.start, input.duration, input.pairedFromId)) {
      throw new Error('时间段与现有时间盒冲突')
    }

    if (!input.skipWhitelistCheck && !isTitleAllowed(input.title)) {
      const fallbackTitle =
        input.title && input.title.trim()
          ? input.title.trim()
          : input.type === 'input'
            ? '输入任务'
            : '输出任务'
      await addLaterItem(fallbackTitle, input.type)
      const error = new Error(TITLE_NOT_ALLOWED_ERROR)
      throw error
    }

    const endMinutes = timeToMinutes(input.start) + input.duration
    const endTime = minutesToTime(endMinutes)
    const newBox: Timebox = {
      id: createId(),
      date: dateKey,
      start: input.start,
      end: endTime,
      type: input.type,
      title: input.title,
      status: 'planned',
      pairedId: undefined,
      autoPaired: input.autoPair,
    }

    timeboxes.value.push(newBox)
    await persist()

    if (input.autoPair) {
      await ensurePairedOutput(newBox)
    }

    return newBox
  }

  async function update(boxId: string, patch: Partial<Timebox>) {
    const idx = timeboxes.value.findIndex((box) => box.id === boxId)
    if (idx === -1) return
    const updated: Timebox = { ...timeboxes.value[idx], ...patch } as Timebox
    timeboxes.value[idx] = updated
    await persist()
  }

  async function setStatus(boxId: string, status: Timebox['status']) {
    await update(boxId, { status })
  }

  async function remove(boxId: string) {
    timeboxes.value = timeboxes.value.filter((box) => box.id !== boxId)
    timeboxes.value.forEach((box) => {
      if (box.pairedId === boxId) {
        box.pairedId = undefined
        box.autoPaired = false
      }
    })
    await persist()
  }

  async function reschedule(
    boxId: string,
    date: Date,
    start: string,
    duration: number,
  ): Promise<void> {
    const dateKey = toDateKey(date)
    if (detectOverlap(dateKey, start, duration, boxId)) {
      throw new Error('时间冲突，无法移动')
    }
    const end = minutesToTime(timeToMinutes(start) + duration)
    await update(boxId, { date: dateKey, start, end })
  }

  async function addLaterItem(title: string, type: TimeboxType) {
    const item: LaterItem = {
      id: createId(),
      title,
      type,
      createdAt: new Date().toISOString(),
    }
    laterList.value.push(item)
    await saveLaterList(laterList.value)
  }

  function isTitleAllowed(title?: string | null): boolean {
    if (!title) return true
    const trimmed = title.trim()
    if (!trimmed) return true
    const settingsStore = useSettingsStore()
    const tags = settingsStore.settings.themeTags ?? []
    if (!tags.length) return true
    const lowered = trimmed.toLowerCase()
    return tags.some((tag) => {
      const normalized = tag?.toString().trim()
      if (!normalized) return false
      return lowered.includes(normalized.toLowerCase())
    })
  }

  function detectOverlap(
    dateKey: string,
    start: string,
    duration: number,
    excludeId?: string,
  ) {
    const startMinutes = timeToMinutes(start)
    const endMinutes = startMinutes + duration
    const dayBoxes = timeboxesByDate.value[dateKey] ?? []
    return dayBoxes.some((box) => {
      if (excludeId && box.id === excludeId) return false
      const existingStart = timeToMinutes(box.start)
      const existingEnd = timeToMinutes(box.end)
      return startMinutes < existingEnd && endMinutes > existingStart
    })
  }

  async function ensurePairedOutput(box: Timebox) {
    if (box.type !== 'input') return
    const duration = durationOf(box)
    const slot = findAvailableSlot(box, duration)
    if (!slot) return

    const paired = await create({
      date: slot.date,
      start: slot.start,
      duration,
      type: 'output',
      title: box.title,
      autoPair: false,
      pairedFromId: box.id,
      skipWhitelistCheck: true,
    })
    await update(box.id, { pairedId: paired.id })
    await update(paired.id, { pairedId: box.id, autoPaired: true })
  }

  function findAvailableSlot(box: Timebox, duration: number) {
    const after = timeToMinutes(box.end) + MIN_GAP_MINUTES
    const dateKey = box.date
    const sameDay = searchSlot(dateKey, after, duration, box.id)
    if (sameDay) return sameDay

    // fallback to next day morning
    let nextDate = nextDay(fromDateKey(dateKey))
    let dateKeyCursor = toDateKey(nextDate)
    let attempt = 0
    while (attempt < 7) {
      const slot = searchSlot(dateKeyCursor, DEFAULT_PAIR_START_MIN, duration)
      if (slot) return slot
      nextDate = nextDay(nextDate)
      dateKeyCursor = toDateKey(nextDate)
      attempt += 1
    }
    return null
  }

  function searchSlot(
    dateKey: string,
    startMinutes: number,
    duration: number,
    excludeId?: string,
  ) {
    const normalizedStart = Math.max(0, startMinutes)
    for (let minute = normalizedStart; minute + duration <= DAY_MINUTES; minute += 5) {
      const startTime = minutesToTime(minute)
      if (!detectOverlap(dateKey, startTime, duration, excludeId)) {
        return { date: fromDateKey(dateKey), start: startTime }
      }
    }
    return null
  }

  async function persist() {
    await saveTimeboxes(timeboxes.value)
  }

  return {
    ready,
    timeboxes,
    laterList,
    upcomingPlanned,
    bootstrap,
    create,
    update,
    setStatus,
    remove,
    reschedule,
    timeboxesForDate,
    timeboxesForRange,
    getById,
    durationOf,
    formatRange,
    addLaterItem,
    detectOverlap,
    ensurePairedOutput,
  }
})
