<script setup lang="ts">
import { RouterLink } from 'vue-router'
import IconSettings from '../icons/IconSettings.vue'
</script>

<template>
  <RouterLink class="shortcut" to="/settings" aria-label="前往设置">
    <IconSettings />
  </RouterLink>
</template>

<style scoped>
.shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  text-decoration: none;
}

.shortcut:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
</style>
