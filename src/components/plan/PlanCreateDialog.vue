<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { TimeboxType } from '../../types/models'
import { formatDateTitle, minutesToTime } from '../../utils/datetime'

const props = defineProps<{
  open: boolean
  date: Date
  startMinutes: number
  endMinutes: number
  initialType: TimeboxType
}>()

const emit = defineEmits<{
  cancel: []
  submit: [
    {
      title: string
      type: TimeboxType
      duration: number
      autoPair: boolean
    },
  ]
}>()

const form = reactive({
  type: props.initialType,
  title: '',
  duration: props.endMinutes - props.startMinutes,
  autoPair: props.initialType === 'input',
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      form.type = props.initialType
      form.duration = props.endMinutes - props.startMinutes
      form.autoPair = props.initialType === 'input'
      form.title = ''
    }
  },
)

const startTime = computed(() => minutesToTime(props.startMinutes))
const endTime = computed(() => minutesToTime(props.endMinutes))
const dateLabel = computed(() => formatDateTitle(props.date))

function handleSubmit() {
  emit('submit', {
    title: form.title.trim(),
    type: form.type,
    duration: form.duration,
    autoPair: form.autoPair,
  })
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <dialog v-if="open" class="plan-create" open>
    <form @submit.prevent="handleSubmit">
      <header class="plan-create__header">
        <div>
          <p class="plan-create__date">{{ dateLabel }}</p>
          <h2 class="plan-create__title">新建时间盒</h2>
        </div>
        <p class="plan-create__slot">{{ startTime }} — {{ endTime }}</p>
      </header>

      <div class="plan-create__group">
        <span class="plan-create__label">类型</span>
        <div class="plan-create__segements">
          <label>
            <input v-model="form.type" type="radio" value="input" />
            <span>输入</span>
          </label>
          <label>
            <input v-model="form.type" type="radio" value="output" />
            <span>输出</span>
          </label>
        </div>
      </div>

      <label class="plan-create__group">
        <span class="plan-create__label">标题</span>
        <input v-model="form.title" type="text" placeholder="可选，限定任务主题" />
      </label>

      <label class="plan-create__group">
        <span class="plan-create__label">时长 (分钟)</span>
        <input v-model.number="form.duration" type="number" min="15" step="15" max="240" />
      </label>

      <label class="plan-create__checkbox">
        <input v-model="form.autoPair" type="checkbox" />
        <span>结束后自动配对 {{ form.type === 'input' ? '输出' : '输入' }} 盒子</span>
      </label>

      <footer class="plan-create__footer">
        <button type="button" class="plan-create__ghost" @click="handleCancel">取消</button>
        <button type="submit" class="plan-create__primary">保存</button>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.plan-create {
  border: none;
  padding: 0;
  max-width: 420px;
  width: min(420px, 90vw);
  border-radius: 20px;
  box-shadow: var(--shadow-card);
  background: var(--surface-raised);
}

.plan-create form {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.plan-create__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.plan-create__date {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.plan-create__title {
  margin: 4px 0 0;
  font-size: 20px;
}

.plan-create__slot {
  margin: 0;
  font-weight: 600;
}

.plan-create__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.plan-create__label {
  font-size: 13px;
  color: var(--text-muted);
}

.plan-create__segements {
  display: flex;
  gap: 12px;
}

.plan-create__segements label {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 8px 12px;
}

.plan-create__group input[type='text'],
.plan-create__group input[type='number'] {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 10px 12px;
}

.plan-create__checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.plan-create__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.plan-create__ghost,
.plan-create__primary {
  border-radius: 999px;
  border: none;
  padding: 10px 20px;
  font-weight: 600;
}

.plan-create__ghost {
  background: transparent;
  border: 1px solid var(--border-subtle);
}

.plan-create__primary {
  background: var(--color-primary);
  color: #fff;
}
</style>
