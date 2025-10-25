<script setup lang="ts">
const props = defineProps<{
  modelValue: number
  options: number[]
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [number]; custom: [] }>()

function handleSelect(value: number) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

function handleCustom() {
  if (props.disabled) return
  emit('custom')
}
</script>

<template>
  <div class="duration">
    <button
      v-for="option in options"
      :key="option"
      type="button"
      class="duration__chip"
      :class="{ 'duration__chip--active': option === modelValue, 'duration__chip--disabled': disabled }"
      @click="handleSelect(option)"
    >
      {{ option }} 分
    </button>
    <button
      type="button"
      class="duration__chip duration__chip--ghost"
      :class="{ 'duration__chip--disabled': disabled }"
      @click="handleCustom"
    >
      自定义
    </button>
  </div>
</template>

<style scoped>
.duration {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.duration__chip {
  border: none;
  border-radius: 999px;
  padding: 8px 16px;
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
}

.duration__chip--active {
  background: var(--color-primary);
  color: #fff;
}

.duration__chip--ghost {
  background: transparent;
  border: 1px dashed var(--border-stronger);
}

.duration__chip--disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
