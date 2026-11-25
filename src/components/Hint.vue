<script setup lang="ts">
// Infobulle « ? » : au survol, au focus clavier ou au toucher. Recadrée pour ne pas sortir de l'écran.
import { nextTick, ref } from 'vue'

defineProps<{ text: string }>()

const open = ref(false)
const shift = ref(0)
const below = ref(false)
const bubble = ref<HTMLElement>()

async function show() {
  if (open.value) return
  shift.value = 0
  below.value = false
  open.value = true
  await nextTick()
  const r = bubble.value?.getBoundingClientRect()
  if (!r) return
  const margin = 8
  if (r.left < margin) shift.value = margin - r.left
  else if (r.right > innerWidth - margin) shift.value = innerWidth - margin - r.right
  below.value = r.top < margin
}
</script>

<template>
  <button
    type="button"
    class="hint"
    :aria-label="text"
    @mouseenter="show"
    @mouseleave="open = false"
    @focus="show"
    @blur="open = false"
    @click="show"
    @keydown.esc="open = false"
  >
    <span aria-hidden="true">?</span>
    <span
      v-if="open"
      ref="bubble"
      class="hint-bubble"
      :class="{ below }"
      role="tooltip"
      aria-hidden="true"
      :style="{ '--shift': `${shift}px` }"
      >{{ text }}</span
    >
  </button>
</template>
