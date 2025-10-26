<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { Session, SessionNotes } from '../../types/models'

const props = defineProps<{ session: Session }>()
const emit = defineEmits<{ submit: [SessionNotes, string[]] }>()

const notes = reactive<SessionNotes>({ ...props.session.notes })
const assetInput = ref('')
const assets = ref<string[]>(props.session.minOutputAssets ? [...props.session.minOutputAssets] : [])
const error = ref('')

watch(
  () => props.session.id,
  () => {
    Object.assign(notes, props.session.notes)
    assets.value = props.session.minOutputAssets ? [...props.session.minOutputAssets] : []
    assetInput.value = ''
    error.value = ''
  },
)

function addAsset() {
  if (!assetInput.value.trim()) return
  assets.value.push(assetInput.value.trim())
  assetInput.value = ''
}

function removeAsset(index: number) {
  assets.value.splice(index, 1)
}

function handleSubmit() {
  if (!notes.learned.trim() || !notes.stuck.trim() || !notes.next.trim()) {
    error.value = '请完成三问三答再结束。'
    return
  }
  error.value = ''
  emit('submit', { ...notes }, [...assets.value])
}
</script>

<template>
  <section class="review">
    <h2 class="review__title">完成页三问</h2>
    <div class="review__grid">
      <label class="review__field">
        <span>我学到了什么？</span>
        <textarea v-model="notes.learned" rows="3" placeholder="写下关键收获" />
      </label>
      <label class="review__field">
        <span>我卡在哪？</span>
        <textarea v-model="notes.stuck" rows="3" placeholder="识别阻碍，下次避开" />
      </label>
      <label class="review__field">
        <span>下一步是什么？</span>
        <textarea v-model="notes.next" rows="3" placeholder="列出可执行下一步" />
      </label>
    </div>

    <div class="review__assets">
      <label>
        <span>最小产出（可附链接或图片 URL）</span>
        <div class="review__input-row">
          <input v-model="assetInput" type="url" placeholder="https://" />
          <button type="button" @click="addAsset">添加</button>
        </div>
      </label>
      <ul v-if="assets.length" class="review__asset-list">
        <li v-for="(item, index) in assets" :key="item" class="review__asset">
          <span>{{ item }}</span>
          <button type="button" @click="removeAsset(index)">移除</button>
        </li>
      </ul>
    </div>

    <p v-if="error" class="review__error">{{ error }}</p>

    <button type="button" class="review__submit" @click="handleSubmit">提交输出</button>
  </section>
</template>

<style scoped>
.review {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.review__grid {
  display: grid;
  gap: 12px;
}

.review__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review__field textarea {
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 10px 12px;
  resize: vertical;
}

.review__assets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review__input-row {
  display: flex;
  gap: 8px;
}

.review__input-row input {
  flex: 1;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  padding: 8px 12px;
}

.review__input-row button {
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  padding: 8px 16px;
}

.review__asset-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review__asset {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 13px;
}

.review__asset button {
  border: none;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
}

.review__error {
  margin: 0;
  color: #d93025;
  text-align: center;
}

.review__submit {
  border: none;
  border-radius: 999px;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  background: var(--color-primary);
  color: #fff;
  width: 100%;
}
</style>
