<script setup lang="ts">
import { onErrorCaptured, onMounted, ref } from 'vue'
import CharacterSummary from './components/CharacterSummary.vue'
import EquipmentTable from './components/EquipmentTable.vue'
import Recommendations from './components/Recommendations.vue'
import { loadGameData, type GameData } from './lib/data'
import {
  ApiError,
  fetchCharacter,
  isValidCharacterName,
  normalizeCharacterName,
  REGIONS,
  type CharacterData,
  type Region,
} from './lib/blizzard'

const nameInput = ref('')
const region = ref<Region>('eu')
const loading = ref(false)
const error = ref('')
const data = ref<CharacterData | null>(null)
const game = ref<GameData | null>(null)
const gameError = ref('')

async function load() {
  const name = normalizeCharacterName(nameInput.value)
  if (!isValidCharacterName(name)) {
    error.value = 'Saisis le prénom et le nom du personnage, par exemple « helga-tartine ».'
    return
  }
  nameInput.value = name
  error.value = ''
  loading.value = true
  // L'URL reflète la recherche, pour pouvoir la partager ou la recharger.
  history.replaceState(null, '', `?c=${encodeURIComponent(name)}&r=${region.value}`)
  // Données d'objets (CDN, une seule fois) en parallèle du perso ; leur échec n'empêche pas d'afficher le perso.
  loadGameData()
    .then((g) => {
      game.value = g
      gameError.value = ''
    })
    .catch((err) => (gameError.value = err instanceof Error ? err.message : String(err)))
  try {
    data.value = await fetchCharacter(region.value, name)
  } catch (err) {
    data.value = null
    if (err instanceof ApiError && err.status === 404) {
      error.value = `Personnage « ${name} » introuvable en ${region.value.toUpperCase()}.`
    } else {
      error.value = `Erreur : ${err instanceof Error ? err.message : String(err)}`
    }
  } finally {
    loading.value = false
  }
}

// Une donnée inattendue de l'API ne doit pas laisser un bloc vide sans explication.
onErrorCaptured((err) => {
  error.value = `Erreur d'affichage : ${err instanceof Error ? err.message : String(err)}`
  return false
})

onMounted(() => {
  const params = new URLSearchParams(location.search)
  const r = params.get('r')
  if (r && (REGIONS as readonly string[]).includes(r)) region.value = r as Region
  const c = params.get('c')
  if (c) {
    nameInput.value = c
    load()
  }
})
</script>

<template>
  <main>
    <h1>Forever Gear Advisor</h1>
    <form @submit.prevent="load">
      <input v-model="nameInput" placeholder="prénom-nom (ex. helga-tartine)" aria-label="Personnage" autofocus />
      <select v-model="region" aria-label="Région">
        <option v-for="r in REGIONS" :key="r" :value="r">{{ r.toUpperCase() }}</option>
      </select>
      <button :disabled="loading">{{ loading ? 'Chargement…' : 'Charger' }}</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-if="data">
      <CharacterSummary :data="data" />
      <Recommendations v-if="game" :data="data" :game="game" />
      <p v-else-if="gameError" class="error">Données d'objets indisponibles : {{ gameError }}</p>
      <p v-else class="muted">Chargement des données d'objets…</p>
      <EquipmentTable :items="data.equipment.equipped_items" />
    </template>
  </main>
</template>
