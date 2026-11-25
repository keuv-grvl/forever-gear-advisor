<script setup lang="ts">
import { computed } from 'vue'
import { detectSpec, type CharacterData } from '../lib/blizzard'

const props = defineProps<{ data: CharacterData }>()

const p = computed(() => props.data.profile)
const spec = computed(() => detectSpec(props.data.specializations))
</script>

<template>
  <section class="summary">
    <h2>{{ p.name }} {{ p.surname }}</h2>
    <p>
      Niveau {{ p.level }} · {{ p.race.name }} · {{ p.character_class.name }}
      <template v-if="spec"> ({{ spec.name }}, {{ spec.points }} pts)</template>
      <template v-else> (spé non détectée)</template>
    </p>
    <p class="muted">
      {{ p.faction.name }} · {{ p.ruleset.name }}
      <template v-if="p.guild"> · &lt;{{ p.guild.name }}&gt;</template>
      · niveau d'objet moyen {{ p.equipped_item_level }}
    </p>
  </section>
</template>
