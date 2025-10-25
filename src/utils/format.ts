export function formatMinutesToClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分`
  if (minutes === 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分`
}

export function formatSecondsToClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
