import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSessionsStore } from '../stores/sessions'

export function useSessionTimer() {
  const sessions = useSessionsStore()
  const now = ref(Date.now())
  let ticker: number | null = null

  const tick = () => {
    now.value = Date.now()
  }

  const startTicker = () => {
    stopTicker()
    ticker = window.setInterval(tick, 500)
  }

  const stopTicker = () => {
    if (ticker) {
      window.clearInterval(ticker)
      ticker = null
    }
  }

  watch(
    () => sessions.runtime.status,
    (status) => {
      if (status === 'running') {
        startTicker()
      } else {
        stopTicker()
      }
      tick()
    },
    { immediate: true },
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', tick)
  })

  onBeforeUnmount(() => {
    stopTicker()
    document.removeEventListener('visibilitychange', tick)
  })

  const elapsed = computed(() => sessions.elapsedSeconds(now.value))
  const remaining = computed(() => sessions.remainingSeconds(now.value))
  const progress = computed(() => {
    const target = sessions.runtime.targetDurationSec || 1
    return Math.max(0, Math.min(1, elapsed.value / target))
  })

  return {
    now,
    elapsed,
    remaining,
    progress,
  }
}
