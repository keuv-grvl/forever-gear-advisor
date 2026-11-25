<script setup lang="ts">
// Champ du nom avec suggestions : persos déjà consultés et membres de leurs guildes (historique du navigateur,
// src/lib/suggest.ts). La liste s'ouvre au clic ou dès qu'on tape ; ↑ ↓ pour choisir, Entrée pour charger, Échap.
import { computed, ref, useId } from 'vue'
import { t } from '../i18n'
import type { Region } from '../lib/blizzard'
import { forgetAll, suggestionGroups } from '../lib/suggest'

const props = defineProps<{ region: Region; placeholder: string; label: string }>()
const model = defineModel<string>({ required: true })
const emit = defineEmits<{ pick: [name: string] }>()

const id = useId()
const open = ref(false)
const active = ref(-1)
// Relu après un effacement (l'historique est dans localStorage, hors de la réactivité de Vue).
const tick = ref(0)

const groups = computed(() => {
  void tick.value
  return open.value ? suggestionGroups(props.region, model.value) : []
})
// Options à plat, dans l'ordre affiché, pour la navigation au clavier.
const flat = computed(() => groups.value.flatMap((g) => g.names))
const optionId = (i: number) => `${id}-opt-${i}`
const indexOf = (gi: number, ni: number) => groups.value.slice(0, gi).reduce((n, g) => n + g.names.length, 0) + ni

function show() {
  open.value = true
  active.value = -1
}
function pick(name: string) {
  model.value = name
  open.value = false
  emit('pick', name)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) return show()
    const n = flat.value.length
    if (!n) return
    if (e.key === 'ArrowDown') active.value = active.value + 1 >= n ? 0 : active.value + 1
    else active.value = active.value <= 0 ? n - 1 : active.value - 1
  } else if (e.key === 'Enter' && open.value && active.value >= 0 && flat.value[active.value]) {
    e.preventDefault() // sinon le formulaire part avec le texte tapé
    pick(flat.value[active.value])
  } else if (e.key === 'Escape') {
    open.value = false
  }
}
function clear() {
  forgetAll()
  tick.value++
  open.value = false
}
</script>

<template>
  <div class="name-field">
    <input
      v-model="model"
      role="combobox"
      :aria-label="label"
      :placeholder="placeholder"
      :aria-expanded="open && flat.length > 0"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="active >= 0 ? optionId(active) : undefined"
      aria-autocomplete="list"
      autocomplete="off"
      autofocus
      @input="show"
      @click="show"
      @keydown="onKey"
      @blur="open = false"
    />
    <div v-if="open && flat.length" :id="`${id}-list`" role="listbox" class="suggest">
      <template v-for="(g, gi) in groups" :key="g.kind + g.label">
        <div class="suggest-group" role="presentation">
          {{ g.kind === 'recent' ? t('suggest.recent') : t('suggest.guild', { guild: g.label }) }}
        </div>
        <div
          v-for="(name, ni) in g.names"
          :id="optionId(indexOf(gi, ni))"
          :key="name"
          role="option"
          :aria-selected="indexOf(gi, ni) === active"
          :class="['suggest-option', { active: indexOf(gi, ni) === active }]"
          @mousedown.prevent="pick(name)"
        >
          {{ name }}
        </div>
      </template>
      <button type="button" class="suggest-clear" @mousedown.prevent="clear">{{ t('suggest.clear') }}</button>
    </div>
  </div>
</template>
