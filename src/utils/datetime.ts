const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTitle(date: Date): string {
  return dateFormatter.format(date)
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date)
}

export function toDateKey(date: Date): string {
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
}

export function fromDateKey(key: string): Date {
  const [yearStr, monthStr, dayStr] = key.split('-')
  const y = Number(yearStr ?? 0)
  const m = Number(monthStr ?? 1)
  const d = Number(dayStr ?? 1)
  return new Date(y, m - 1, d)
}

export function timeToMinutes(time: string): number {
  const [hourStr, minuteStr] = time.split(':')
  const hours = Number(hourStr ?? 0)
  const minutes = Number(minuteStr ?? 0)
  return hours * 60 + minutes
}

export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${pad(hours)}:${pad(minutes)}`
}

export function addMinutes(time: string, delta: number): string {
  const minutes = (timeToMinutes(time) + delta + 24 * 60) % (24 * 60)
  return minutesToTime(minutes)
}

export function diffMinutes(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start)
}

export function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60000)
}

export function nextDay(date: Date): Date {
  const next = new Date(date)
  next.setDate(date.getDate() + 1)
  return next
}

export function clampMinutes(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function dateWithTime(date: Date, time: string): Date {
  const [hourStr, minuteStr] = time.split(':')
  const h = Number(hourStr ?? 0)
  const m = Number(minuteStr ?? 0)
  const copy = new Date(date)
  copy.setHours(h, m, 0, 0)
  return copy
}
