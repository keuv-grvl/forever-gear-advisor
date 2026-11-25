<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { langInfo, specName as specLabel, t, type MessageKey } from '../i18n'
import { detectSpec, fetchPrices, wowheadItemUrl, type CharacterData, type Prices } from '../lib/blizzard'
import { SLOT_ORDER, type GameData } from '../lib/data'
import { randomOffers } from '../lib/random'
import { itemKey, ORIGINS, recommend, sideOf, sourcesFor, type Crafter, type DbItem, type Origin, type Source } from '../lib/recommend'
import { CLASS_KEYS, wearableArmorTypes } from '../lib/rules'
import { findSpec, weightsAt } from '../lib/scoring'
import { readPrefs, writePrefs } from '../lib/suggest'
import CandidateLine from './CandidateLine.vue'
import Hint from './Hint.vue'

const props = defineProps<{ data: CharacterData; game: GameData }>()
const game = computed(() => props.game)

const profile = computed(() => props.data.profile)
// Clé anglaise de la classe (poids Polestar) : le nom renvoyé par l'API dépend de la langue.
const classKey = computed(() => CLASS_KEYS[profile.value.character_class.id] ?? profile.value.character_class.name)
const specChoices = computed(() => game.value.weights.specs.filter((s) => s.class === classKey.value))
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

// Spé détectée par défaut, à chaque nouveau perso.
watch(
  () => [props.data, game.value] as const,
  () => {
    const detected = detectSpec(props.data.specializations)
    specName.value = findSpec(game.value.weights, classKey.value, detected?.name)?.spec ?? ''
  },
  { immediate: true },
)

const spec = computed(() => findSpec(game.value.weights, classKey.value, specName.value))
const maxLevel = computed(() => profile.value.level + (anticipate.value ? 5 : 0))
const side = computed(() => sideOf(profile.value.faction.type))
const doneQuests = computed(() => new Set(props.data.quests?.done ?? []))
// Métiers et recettes connues (absents si l'API ne les a pas donnés : aucun craft écarté).
const crafter = computed<Crafter | undefined>(() => {
  const list = props.data.professions
  if (!list) return undefined
  return { professions: new Set(list.map((p) => p.id)), recipes: new Set(list.flatMap((p) => p.recipes)) }
})
const activeQuests = computed(() => new Set(props.data.quests?.active ?? []))

// Prix HV (facultatifs) : chargés à chaque perso, servis par le cache CDN la plupart du temps.
const prices = ref<Prices | null>(null)
watch(
  () => [props.data.region, props.data.profile.ruleset?.id, props.data.profile.faction.type] as const,
  ([region, ruleset, faction]) => {
    prices.value = null
    if (!region || ruleset === undefined) return
    fetchPrices(region, ruleset, faction)
      .then((p) => {
        if (props.data.region === region && props.data.profile.faction.type === faction) prices.value = p
      })
      .catch(() => {}) // sans prix, le reste s'affiche normalement
  },
  { immediate: true },
)
const priceNote = computed(() => {
  const p = prices.value
  if (!p) return ''
  const when = new Date(p.generated).toLocaleString(langInfo().bcp47, { dateStyle: 'short', timeStyle: 'short' })
  return t('price.note', { houses: p.houses, faction: profile.value.faction.name, when })
})

// Objets à stats aléatoires : seulement ceux en vente (clés « objet:suffixe » des prix).
const items = computed(() => {
  const p = prices.value?.prices
  if (!p) return game.value.items
  return [...game.value.items, ...randomOffers(game.value.random, Object.keys(p).filter((k) => k.includes(':')))]
})

const advice = computed(() => {
  if (!spec.value) return []
  return recommend(props.data.equipment.equipped_items, items.value, {
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
    crafter: crafter.value,
  })
})

// Gain : les plus grosses améliorations d'abord (ordre du moteur). Emplacement : ordre de la fiche personnage.
const rows = computed(() =>
  sortBy.value === 'slot' ? [...advice.value].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)) : advice.value,
)

function sourcesOf(item: DbItem): Source[] {
  return sourcesFor(game.value.sources[item.id], item, {
    side: side.value,
    classId: profile.value.character_class.id,
    done: doneQuests.value,
    crafter: crafter.value,
  })
}

const armorHint = computed(() => {
  const types = wearableArmorTypes(profile.value.character_class.id, maxLevel.value)
  const armor = (id: number) => t(`armor.${id}` as MessageKey)
  const best = armor(types[types.length - 1])
  if (types.length < 2) return t('hint.armorOnly', { best })
  const lighter = types.slice(0, -1).map(armor).join(t('list.and'))
  return t('hint.armor', { best, lighter, level: maxLevel.value })
})

const slotLabel = (slot: string) => t(`slot.${slot}` as MessageKey)
const othersLabel = (n: number) => (n > 1 ? t('reco.moreMany', { n }) : t('reco.moreOne'))

// Pied de tableau : texte traduit, avec un lien à la place de {polestar}.
const footer = computed(() => t('reco.footer', { date: game.value.generated }).split('{polestar}'))
</script>

<template>
  <section>
    <h3>{{ t('reco.title') }}</h3>
    <div class="controls">
      <span class="control">
        <label>
          {{ t('reco.spec') }}
          <select v-model="specName">
            <option v-for="s in specChoices" :key="s.spec" :value="s.spec">{{ specLabel(s.spec) }}</option>
          </select>
        </label>
        <Hint :text="t('hint.spec')" />
      </span>
      <span class="control">
        <label>
          {{ t('reco.sortBy') }}
          <select v-model="sortBy">
            <option value="gain">{{ t('reco.sortGain') }}</option>
            <option value="slot">{{ t('reco.sortSlot') }}</option>
          </select>
        </label>
        <Hint :text="t('hint.sort')" />
      </span>
      <span class="control">
        <label><input v-model="mainArmorOnly" type="checkbox" /> {{ t('reco.mainArmor') }}</label>
        <Hint :text="armorHint" />
      </span>
      <span class="control">
        <label><input v-model="anticipate" type="checkbox" /> {{ t('reco.anticipate') }}</label>
        <Hint :text="t('hint.anticipate')" />
      </span>
    </div>
    <fieldset class="controls origins">
      <legend>{{ t('reco.origin') }}<Hint :text="t('hint.origins')" /></legend>
      <label v-for="o in ORIGINS" :key="o"><input v-model="origins" type="checkbox" :value="o" /> {{ t(`origin.${o}`) }}</label>
    </fieldset>
    <p v-if="origins.length === 0" class="error">{{ t('reco.pickOrigin') }}</p>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('reco.colSlot') }}</th>
            <th :title="t('reco.colEquippedTitle')">{{ t('reco.colEquipped') }}</th>
            <th>{{ t('reco.colBest') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in rows" :key="a.slot">
            <td>{{ slotLabel(a.slot) }}</td>
            <td>
              <template v-if="a.equipped">
                <a :href="wowheadItemUrl(a.equipped.id, a.equipped.sfx)" target="_blank" rel="noopener">{{ a.equipped.name }}</a>
                <span class="muted"> ({{ a.equipped.score.toFixed(1) }})</span>
              </template>
              <span v-else class="empty">{{ t('reco.empty') }}</span>
            </td>
            <td>
              <p v-if="a.candidates.length === 0" class="muted">{{ t('reco.nothing') }}</p>
              <template v-else>
                <ul class="candidates">
                  <CandidateLine
                    :c="a.candidates[0]"
                    :sources="sourcesOf(a.candidates[0].item)"
                    :active-quests="activeQuests"
                    :price="prices?.prices[itemKey(a.candidates[0].item)]"
                    :price-note="priceNote"
                    :side="side"
                    :crafter="crafter"
                  />
                </ul>
                <details v-if="a.candidates.length > 1" class="more">
                  <summary>{{ othersLabel(a.candidates.length - 1) }}</summary>
                  <ul class="candidates">
                    <CandidateLine
                      v-for="c in a.candidates.slice(1)"
                      :key="itemKey(c.item)"
                      :c="c"
                      :sources="sourcesOf(c.item)"
                      :active-quests="activeQuests"
                      :price="prices?.prices[itemKey(c.item)]"
                      :price-note="priceNote"
                      :side="side"
                      :crafter="crafter"
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
      {{ footer[0] }}<a :href="game.weights.source.url" target="_blank" rel="noopener">Polestar</a>{{ footer[1] }}
      <template v-if="t('reco.footerNpc')">{{ ' ' + t('reco.footerNpc') }}</template>
    </p>
  </section>
</template>
