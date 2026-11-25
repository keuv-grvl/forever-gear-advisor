<script setup lang="ts">
import { computed, onErrorCaptured, onMounted, ref, watch } from 'vue'
import CharacterSummary from './components/CharacterSummary.vue'
import GearTable from './components/GearTable.vue'
import { lang, langInfo, LANGS, t } from './i18n'
import { loadGameData, type GameData } from './lib/data'
import { remember, suggestions } from './lib/suggest'
import {
  ApiError,
  displayName,
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
// Autocomplétion : relue après chaque recherche réussie (localStorage, aucune requête).
const suggestTick = ref(0)
const nameSuggestions = computed(() => {
  void suggestTick.value // dépendance : relire après chaque recherche
  return suggestions(region.value)
})

// Perso affiché, pour le recharger dans une autre langue.
let current: { region: Region; name: string } | null = null

// URL d'un perso : /eu/helga-tartine (région, puis nom canonique). Le ruleset n'y est pas : la région et le nom
// suffisent à trouver le perso, l'API donne son ruleset.
const pathOf = (r: Region, name: string) => `/${r}/${encodeURIComponent(name)}`
function parsePath(path: string): { region: Region; name: string } | null {
  const m = /^\/([a-z]{2})\/([^/]+)\/?$/.exec(path)
  if (!m || !(REGIONS as readonly string[]).includes(m[1])) return null
  return { region: m[1] as Region, name: decodeURIComponent(m[2]) }
}

async function load(fromHistory = false) {
  const name = normalizeCharacterName(nameInput.value)
  if (!isValidCharacterName(name)) {
    error.value = t('error.name')
    return
  }
  error.value = ''
  loading.value = true
  // L'URL reflète la recherche (partage, rechargement) ; chaque nouveau perso est une entrée de l'historique.
  const path = pathOf(region.value, name)
  if (!fromHistory && location.pathname !== path) history.pushState(null, '', path)
  // Données d'objets (CDN, une seule fois) en parallèle du perso ; leur échec n'empêche pas d'afficher le perso.
  loadGameData()
    .then((g) => {
      game.value = g
      gameError.value = ''
    })
    .catch((err) => (gameError.value = err instanceof Error ? err.message : String(err)))
  try {
    const d = await fetchCharacter(region.value, name, langInfo().locale)
    data.value = d
    current = { region: region.value, name }
    nameInput.value = displayName(d.profile)
    document.title = `${nameInput.value} · Forever Gear Advisor`
    remember(region.value, nameInput.value, d.profile.guild?.slug, d.guildMembers)
    suggestTick.value++
  } catch (err) {
    data.value = null
    if (err instanceof ApiError && err.status === 404) {
      error.value = t('error.notFound', { name, region: region.value.toUpperCase() })
    } else {
      error.value = t('error.generic', { message: err instanceof Error ? err.message : String(err) })
    }
  } finally {
    loading.value = false
  }
}

// Une donnée inattendue de l'API ne doit pas laisser un bloc vide sans explication.
onErrorCaptured((err) => {
  error.value = t('error.render', { message: err instanceof Error ? err.message : String(err) })
  return false
})

// Autre langue : noms du perso (classe, objets, stats…) redemandés dans cette langue ; l'ancien reste affiché d'ici là.
watch(lang, async () => {
  if (!current) return
  const { region: r, name } = current
  try {
    const d = await fetchCharacter(r, name, langInfo().locale)
    if (current?.name === name && current.region === r) data.value = d
  } catch {
    // on garde l'affichage précédent
  }
})

// Ouvre le perso de l'URL : /eu/helga-tartine, ou l'ancienne forme ?c=helga-tartine&r=eu (remplacée par la nouvelle).
function openFromUrl(fromHistory: boolean) {
  let target = parsePath(location.pathname)
  const params = new URLSearchParams(location.search)
  const c = params.get('c')
  const r = params.get('r') ?? 'eu'
  if (!target && c && (REGIONS as readonly string[]).includes(r)) {
    target = { region: r as Region, name: normalizeCharacterName(c) }
    history.replaceState(null, '', pathOf(target.region, target.name))
  }
  if (!target || (current?.region === target.region && current.name === target.name)) return
  region.value = target.region
  nameInput.value = target.name
  load(fromHistory)
}

onMounted(() => openFromUrl(true))
// Précédent / Suivant du navigateur : le perso de l'URL.
window.addEventListener('popstate', () => openFromUrl(true))
</script>

<template>
  <main>
    <header class="top">
      <h1>Forever Gear Advisor</h1>
      <select v-model="lang" class="lang" :aria-label="t('form.language')" :title="t('form.language')">
        <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.label }}</option>
      </select>
    </header>
    <form @submit.prevent="load()">
      <select v-model="region" :aria-label="t('form.region')">
        <option v-for="r in REGIONS" :key="r" :value="r">{{ r.toUpperCase() }}</option>
      </select>
      <input
        v-model="nameInput"
        :placeholder="t('form.placeholder')"
        :aria-label="t('form.character')"
        list="character-suggestions"
        autocomplete="off"
        autofocus
      />
      <datalist id="character-suggestions">
        <option v-for="n in nameSuggestions" :key="n" :value="n" />
      </datalist>
      <button :disabled="loading">{{ loading ? t('form.loading') : t('form.load') }}</button>
    </form>
    <p v-if="error" class="error">{{ error }}</p>
    <template v-if="data">
      <CharacterSummary :data="data" />
      <GearTable v-if="game" :data="data" :game="game" />
      <p v-else-if="gameError" class="error">{{ t('error.gameData', { message: gameError }) }}</p>
      <p v-else class="muted">{{ t('loading.gameData') }}</p>
    </template>
  </main>
</template>
