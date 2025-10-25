import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useUIStore = defineStore('ui', () => {
  const discomfortPanelOpen = ref(false)

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const isDiscomfortPanelOpen = computed(() => discomfortPanelOpen.value)

  function openDiscomfortPanel() {
    discomfortPanelOpen.value = true
  }

  function closeDiscomfortPanel() {
    discomfortPanelOpen.value = false
  }

  function toggleDiscomfortPanel() {
    discomfortPanelOpen.value = !discomfortPanelOpen.value
  }

  return {
    isDiscomfortPanelOpen,
    openDiscomfortPanel,
    closeDiscomfortPanel,
    toggleDiscomfortPanel,
    prefersReducedMotion,
  }
})
