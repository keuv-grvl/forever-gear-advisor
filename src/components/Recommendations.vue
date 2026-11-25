<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { detectSpec, wowheadItemUrl, type CharacterData } from '../lib/blizzard'
import { SLOT_LABELS, type GameData } from '../lib/data'
import { ORIGINS, recommend, sideOf, sourcesFor, type DbItem, type Origin, type Source } from '../lib/recommend'
import { ARMOR_NAMES, wearableArmorTypes } from '../lib/rules'
import { findSpec, weightsAt } from '../lib/scoring'
import { readPrefs, writePrefs } from '../lib/suggest'
import CandidateLine from './CandidateLine.vue'
import Hint from './Hint.vue'

const props = defineProps<{ data: CharacterData; game: GameData }>()
const game = computed(() => props.game)

const profile = computed(() => props.data.profile)
const specChoices = computed(() => game.value.weights.specs.filter((s) => s.class === profile.value.character_class.name))
const specName = ref('')

// Préférences gardées dans le navigateur ; une valeur inattendue retombe sur le défaut.
// Les origines décochées sont gardées (plutôt que les cochées) : une origine ajoutée plus tard sera cochée.
const prefs = readPrefs({ sort: 'gain', mainArmorOnly: true, anticipate: false, hiddenOrigins: [] as string[] })
const hidden = Array.isArray(prefs.hiddenOrigins) ? prefs.hiddenOrigins : []
const sortBy = ref<'gain' | 'slot'>(prefs.sort === 'slot' ? 'slot' : 'gain')
const mainArmorOnly = ref(prefs.mainArmorOnly !== false)
const anticipate = ref(prefs.anticipate === true)
const origins = ref<Origin[]>(ORIGINS.filter((o) => !hidden.includes(o)))
watch(
  [sortBy, mainArmorOnly, anticipate, origins],
  () =>
    writePrefs({
      sort: sortBy.value,
      mainArmorOnly: mainArmorOnly.value,
      anticipate: anticipate.value,
      hiddenOrigins: ORIGINS.filter((o) => !origins.value.includes(o)),
    }),
  { deep: true },
)

const ORIGIN_LABELS: Record<Origin, string> = {
  quest: 'Quêtes',
  dungeon: 'Quêtes de donjon ou raid',
  craft: 'Craft',
  vendor: 'Vendeurs',
  rep: 'Réputation',
  unknown: 'Source inconnue',
}

// Spé détectée par défaut, à chaque nouveau perso.
watch(
  () => [props.data, game.value] as const,
  () => {
    const detected = detectSpec(props.data.specializations)
    specName.value = findSpec(game.value.weights, profile.value.character_class.name, detected?.name)?.spec ?? ''
  },
  { immediate: true },
)

const spec = computed(() => findSpec(game.value.weights, profile.value.character_class.name, specName.value))
const maxLevel = computed(() => profile.value.level + (anticipate.value ? 5 : 0))
const doneQuests = computed(() => new Set(props.data.quests?.done ?? []))
const activeQuests = computed(() => new Set(props.data.quests?.active ?? []))

const advice = computed(() => {
  if (!spec.value) return []
  return recommend(props.data.equipment.equipped_items, game.value.items, {
    classId: profile.value.character_class.id,
    level: profile.value.level,
    faction: profile.value.faction.type,
    weights: weightsAt(game.value.weights, spec.value, profile.value.level),
    anticipate: anticipate.value ? 5 : 0,
    perSlot: 3,
    mainArmorOnly: mainArmorOnly.value,
    sources: game.value.sources,
    origins: new Set(origins.value),
    doneQuests: doneQuests.value,
  })
})

// Gain : les plus grosses améliorations d'abord (ordre du moteur). Emplacement : ordre de la fiche personnage.
const SLOT_ORDER = Object.keys(SLOT_LABELS)
const rows = computed(() =>
  sortBy.value === 'slot' ? [...advice.value].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)) : advice.value,
)

function sourcesOf(item: DbItem): Source[] {
  return sourcesFor(game.value.sources[item.id], sideOf(profile.value.faction.type), profile.value.character_class.id, doneQuests.value)
}

const HINTS = {
  spec: "Les stats n'ont pas la même valeur selon la spé (poids Polestar). Par défaut : la spé où tu as mis le plus de points de talent.",
  sort: "Gain : les emplacements où l'amélioration est la plus forte d'abord. Emplacement : l'ordre de la fiche personnage (tête, cou, épaules…).",
  anticipate: "Propose aussi des objets jusqu'à 5 niveaux au-dessus du tien, pour préparer la suite. Le niveau requis est indiqué à côté de chaque objet.",
  origins:
    "Un objet est proposé si au moins une de ses sources est cochée. Décocher « Réputation » retire tous les objets qui demandent une réputation, quelle que soit leur source. Les drops (monstres, boss, coffres) ne sont pas dans les données : un objet de donjon n'apparaît que s'il est donné par une quête.",
}

const armorHint = computed(() => {
  const types = wearableArmorTypes(profile.value.character_class.id, maxLevel.value)
  const best = ARMOR_NAMES[types[types.length - 1]]
  if (types.length < 2) return `Ta classe ne porte que du ${best} : cette option ne change rien.`
  const lighter = types.slice(0, -1).map((t) => ARMOR_NAMES[t])
  return (
    `Coché : pour la tête, les épaules, le torse, les poignets, les mains, la taille, les jambes et les pieds, seulement de l'armure en ${best}, ` +
    `le type le plus lourd que ta classe porte au niveau ${maxLevel.value}. ` +
    `Décoché : aussi l'armure en ${lighter.join(' et ')} (moins d'armure, parfois de meilleures stats). ` +
    'Le dos, le cou, les doigts et les bijoux ne sont pas concernés.'
  )
})

function othersLabel(n: number): string {
  return n > 1 ? `${n} autres options` : '1 autre option'
}
</script>

<template>
  <section>
    <h3>Améliorations</h3>
    <div class="controls">
      <span class="control">
        <label>
          Spé
          <select v-model="specName">
            <option v-for="s in specChoices" :key="s.spec" :value="s.spec">{{ s.spec }}</option>
          </select>
        </label>
        <Hint :text="HINTS.spec" />
      </span>
      <span class="control">
        <label>
          Trier par
          <select v-model="sortBy">
            <option value="gain">Gain</option>
            <option value="slot">Emplacement</option>
          </select>
        </label>
        <Hint :text="HINTS.sort" />
      </span>
      <span class="control">
        <label><input v-model="mainArmorOnly" type="checkbox" /> Type d'armure principal seulement</label>
        <Hint :text="armorHint" />
      </span>
      <span class="control">
        <label><input v-model="anticipate" type="checkbox" /> Anticiper (+5 niveaux)</label>
        <Hint :text="HINTS.anticipate" />
      </span>
    </div>
    <fieldset class="controls origins">
      <legend>Origine<Hint :text="HINTS.origins" /></legend>
      <label v-for="o in ORIGINS" :key="o"><input v-model="origins" type="checkbox" :value="o" /> {{ ORIGIN_LABELS[o] }}</label>
    </fieldset>
    <p v-if="origins.length === 0" class="error">Coche au moins une origine.</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Slot</th>
            <th title="Score : somme des stats de l'objet, pondérées pour la spé">Équipé (score)</th>
            <th>Meilleure option</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.slot">
            <td>{{ SLOT_LABELS[a.slot] ?? a.slot }}</td>
            <td>
              <template v-if="a.equipped">
                <a :href="wowheadItemUrl(a.equipped.id)" target="_blank" rel="noopener">{{ a.equipped.name }}</a>
                <span class="muted"> ({{ a.equipped.score.toFixed(1) }})</span>
              </template>
              <span v-else class="empty">vide</span>
            </td>
            <td>
              <p v-if="a.candidates.length === 0" class="muted">Rien de mieux trouvé</p>
              <template v-else>
                <ul class="candidates">
                  <CandidateLine :c="a.candidates[0]" :sources="sourcesOf(a.candidates[0].item)" :active-quests="activeQuests" />
                </ul>
                <details v-if="a.candidates.length > 1" class="more">
                  <summary>{{ othersLabel(a.candidates.length - 1) }}</summary>
                  <ul class="candidates">
                    <CandidateLine
                      v-for="c in a.candidates.slice(1)"
                      :key="c.item.id"
                      :c="c"
                      :sources="sourcesOf(c.item)"
                      :active-quests="activeQuests"
                    />
                  </ul>
                </details>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="muted small">
      Score : somme des stats pondérées pour la spé (poids
      <a :href="game.weights.source.url" target="_blank" rel="noopener">Polestar</a>, GPL-3.0). Le gain est l'écart avec l'objet porté.
      « ~ » : niveau estimé, l'API ne donne pas de niveau requis. Objets : API Blizzard WoW Forever ({{ game.generated }}) ; quêtes :
      forever-db (Polestar) ; vendeurs : forever-db (fatedfr). Les drops ne sont pas indiqués, et les objets à suffixe aléatoire (« of the
      Owl ») ne sont pas proposés.
    </p>
  </section>
</template>
