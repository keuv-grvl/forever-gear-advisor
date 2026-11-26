<script setup lang="ts">
// Équipement du perso et marge de progression : une ligne par emplacement avec le score de l'objet porté et le
// meilleur score possible (selon la spé et les filtres). Un clic sur une ligne affiche les options de l'emplacement.
import { computed, ref, watch } from 'vue'
import { formatNumber, langInfo, specName as specLabel, t, type MessageKey } from '../i18n'
import { detectSpec, fetchPrices, wowheadItemUrl, type CharacterData, type EquippedItem, type Prices } from '../lib/blizzard'
import { SLOT_ORDER, type GameData } from '../lib/data'
import { randomOffers } from '../lib/random'
import {
  itemKey,
  ORIGINS,
  recommend,
  sideOf,
  sourcesFor,
  type Crafter,
  type DbItem,
  type Origin,
  type SlotAdvice,
  type Source,
} from '../lib/recommend'
import { CLASS_KEYS, wearableArmorTypes } from '../lib/rules'
import { findSpec, weightsAt } from '../lib/scoring'
import { readPrefs, writePrefs } from '../lib/suggest'
import CandidateLine from './CandidateLine.vue'
import Hint from './Hint.vue'
import ItemStats from './ItemStats.vue'

const props = defineProps<{ data: CharacterData; game: GameData }>()
const game = computed(() => props.game)

const profile = computed(() => props.data.profile)
// Clé anglaise de la classe (poids Polestar) : le nom renvoyé par l'API dépend de la langue.
const classKey = computed(() => CLASS_KEYS[profile.value.character_class.id] ?? profile.value.character_class.name)
const specChoices = computed(() => game.value.weights.specs.filter((s) => s.class === classKey.value))
const specName = ref('')

// Préférences gardées dans le navigateur ; une valeur inattendue retombe sur le défaut.
// Les origines décochées sont gardées (plutôt que les cochées) : une origine ajoutée plus tard sera cochée.
// `sortBy` remplace `sort` (défaut passé de « gain » à « emplacement ») : l'ancien choix est ignoré une fois.
const prefs = readPrefs({ sortBy: 'slot', mainArmorOnly: true, anticipate: false, ahead: -1, hiddenOrigins: [] as string[], repReachedOnly: false })
const hidden = Array.isArray(prefs.hiddenOrigins) ? prefs.hiddenOrigins : []
const sortBy = ref<'gain' | 'slot'>(prefs.sortBy === 'gain' ? 'gain' : 'slot')
const mainArmorOnly = ref(prefs.mainArmorOnly !== false)
// Niveaux d'avance (0 à 6). L'ancienne case « Anticiper (+5) » cochée devient 5.
const MAX_AHEAD = 6
const savedAhead = Number(prefs.ahead)
const ahead = ref(Number.isInteger(savedAhead) && savedAhead >= 0 ? Math.min(savedAhead, MAX_AHEAD) : prefs.anticipate === true ? 5 : 0)
/** Saisie du champ : entier borné à 0..6, sinon on garde la valeur précédente. */
function setAhead(e: Event) {
  const input = e.target as HTMLInputElement
  const n = Math.round(Number(input.value))
  if (input.value !== '' && Number.isFinite(n)) ahead.value = Math.min(MAX_AHEAD, Math.max(0, n))
  input.value = String(ahead.value)
}
const repReachedOnly = ref(prefs.repReachedOnly === true)
const origins = ref<Origin[]>(ORIGINS.filter((o) => !hidden.includes(o)))
watch(
  [sortBy, mainArmorOnly, ahead, origins, repReachedOnly],
  () =>
    writePrefs({
      sortBy: sortBy.value,
      mainArmorOnly: mainArmorOnly.value,
      ahead: ahead.value,
      hiddenOrigins: ORIGINS.filter((o) => !origins.value.includes(o)),
      repReachedOnly: repReachedOnly.value,
    }),
  { deep: true },
)

// Spé détectée par défaut et lignes repliées, à chaque nouveau perso.
const open = ref(new Set<string>())
watch(
  () => [props.data, game.value] as const,
  () => {
    const detected = detectSpec(props.data.specializations)
    specName.value = findSpec(game.value.weights, classKey.value, detected?.name)?.spec ?? ''
    open.value = new Set()
  },
  { immediate: true },
)

const spec = computed(() => findSpec(game.value.weights, classKey.value, specName.value))
const maxLevel = computed(() => profile.value.level + ahead.value)
const side = computed(() => sideOf(profile.value.faction.type))
const doneQuests = computed(() => new Set(props.data.quests?.done ?? []))
// Métiers et recettes connues (absents si l'API ne les a pas donnés : aucun craft écarté).
const crafter = computed<Crafter | undefined>(() => {
  const list = props.data.professions
  if (!list) return undefined
  return { professions: new Set(list.map((p) => p.id)), recipes: new Set(list.flatMap((p) => p.recipes)) }
})
// Réputations du perso, par nom anglais de faction (absentes si l'API ne les a pas données).
const reputations = computed(() => (props.data.reputations ? new Map(props.data.reputations.map((r) => [r.name, r])) : undefined))
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
    anticipate: ahead.value,
    perSlot: 3,
    mainArmorOnly: mainArmorOnly.value,
    sources: game.value.sources,
    origins: new Set(origins.value),
    doneQuests: doneQuests.value,
    crafter: crafter.value,
    reachedReputations:
      repReachedOnly.value && props.data.reputations ? new Map(props.data.reputations.map((r) => [r.name, r.tier])) : undefined,
  })
})

interface Row {
  slot: string
  label: string
  item?: EquippedItem
  advice?: SlotAdvice
  /** Score de l'objet porté (0 si l'emplacement est vide) ; absent si l'emplacement n'est pas évalué (chemise…). */
  score?: number
  /** Meilleur score possible : score + gain de la meilleure option. */
  best?: number
  gain: number
}

// Une ligne par emplacement de la fiche personnage. Chemise et tabard seulement s'ils sont portés ; pas de main
// gauche avec une arme à deux mains (les options d'arme comparent alors des ensembles, voir recommend).
const OPTIONAL = new Set(['SHIRT', 'TABARD'])
const rows = computed<Row[]>(() => {
  const bySlot = new Map(props.data.equipment.equipped_items.map((i) => [i.slot.type, i]))
  const adviceBySlot = new Map(advice.value.map((a) => [a.slot, a]))
  const twoHanded = bySlot.get('MAIN_HAND')?.inventory_type?.type === 'TWOHWEAPON'
  const list = SLOT_ORDER.filter((s) => bySlot.has(s) || !(OPTIONAL.has(s) || (s === 'OFF_HAND' && twoHanded))).map((slot): Row => {
    const a = adviceBySlot.get(slot)
    const score = a ? (a.equipped?.score ?? 0) : undefined
    const gain = Math.max(0, a?.candidates[0]?.gain ?? 0)
    return { slot, label: t(`slot.${slot}` as MessageKey), item: bySlot.get(slot), advice: a, score, best: score === undefined ? undefined : score + gain, gain }
  })
  // Gain : les plus grosses marges de progression d'abord. Emplacement : ordre de la fiche personnage.
  return sortBy.value === 'gain' ? list.sort((x, y) => y.gain - x.gain || SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot)) : list
})

/**
 * Récap : somme des scores portés et somme des meilleurs scores possibles. Armes : avec main droite + main gauche,
 * la meilleure option de main droite peut être une arme à deux mains, qui remplace les deux ; on compte la meilleure
 * combinaison une fois (2M seule, ou main droite + main gauche) au lieu d'additionner les gains des deux lignes.
 */
const totals = computed(() => {
  let score = 0
  let best = 0
  for (const r of rows.value) {
    if (r.score === undefined) continue
    score += r.score
    best += r.best ?? r.score
  }
  const mh = rows.value.find((r) => r.slot === 'MAIN_HAND')
  const oh = rows.value.find((r) => r.slot === 'OFF_HAND')
  if (mh?.advice && oh?.advice) {
    const gains = (twoHand: boolean) =>
      Math.max(0, ...mh.advice!.candidates.filter((c) => (c.item.slot === 'TWOHWEAPON') === twoHand).map((c) => c.gain))
    best += Math.max(gains(true), gains(false) + oh.gain) - (mh.gain + oh.gain)
  }
  return { score, best, pct: best > 0 ? Math.min(100, Math.round((score / best) * 100)) : 100 }
})

const expandable = (r: Row) => (r.advice?.candidates.length ?? 0) > 0
function toggle(slot: string) {
  const next = new Set(open.value)
  if (!next.delete(slot)) next.add(slot)
  open.value = next
}
// Tout déplier / tout replier : « replier » dès que toutes les lignes dépliables sont ouvertes.
const allOpen = computed(() => {
  const list = rows.value.filter(expandable)
  return list.length > 0 && list.every((r) => open.value.has(r.slot))
})
function toggleAll() {
  open.value = allOpen.value ? new Set() : new Set(rows.value.filter(expandable).map((r) => r.slot))
}
// Clic sur la ligne : déplie, sauf sur un lien (Wowhead) ou un bouton (infobulle, flèche).
function onRowClick(e: MouseEvent, r: Row) {
  if (!expandable(r) || (e.target as HTMLElement).closest('a, button')) return
  toggle(r.slot)
}
/** Part du meilleur score déjà atteinte, pour la barre de progression. */
const ratio = (r: Row) => (r.best ? Math.min(100, Math.round(((r.score ?? 0) / r.best) * 100)) : 100)

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

// Pied de tableau : texte traduit, avec un lien à la place de {polestar}.
const footer = computed(() => t('reco.footer', { date: game.value.generated }).split('{polestar}'))
</script>

<template>
  <section>
    <h3>{{ t('equip.title') }}</h3>
    <!-- Ligne 1 : spé à gauche, tri à droite. Ligne 2 : les cases à cocher. -->
    <div class="controls controls-top">
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
    </div>
    <div class="controls">
      <span class="control">
        <label><input v-model="mainArmorOnly" type="checkbox" /> {{ t('reco.mainArmor') }}</label>
        <Hint :text="armorHint" />
      </span>
      <span v-if="data.reputations" class="control">
        <label><input v-model="repReachedOnly" type="checkbox" /> {{ t('reco.repReached') }}</label>
        <Hint :text="t('hint.repReached')" />
      </span>
      <span class="control">
        <label class="ahead"
          >{{ t('reco.anticipate') }}
          <input type="number" min="0" :max="MAX_AHEAD" step="1" inputmode="numeric" :value="ahead" @change="setAhead" />
          {{ t('reco.anticipateUnit') }}</label
        >
        <Hint :text="t('hint.anticipate')" />
      </span>
    </div>
    <fieldset class="controls origins">
      <legend>{{ t('reco.origin') }}<Hint :text="t('hint.origins')" /></legend>
      <label v-for="o in ORIGINS" :key="o"><input v-model="origins" type="checkbox" :value="o" /> {{ t(`origin.${o}`) }}</label>
    </fieldset>
    <p v-if="origins.length === 0" class="error">{{ t('reco.pickOrigin') }}</p>

    <p class="gear-total">
      <span class="label">
        {{ t('gear.total', { score: formatNumber(totals.score, 0), best: formatNumber(totals.best, 0) }) }}<Hint
          :text="t('gear.totalHint')"
        />
      </span>
      <span class="bar" :title="`${totals.pct} %`"><span :style="{ width: `${totals.pct}%` }"></span></span>
      <button type="button" class="toggle-all" :aria-pressed="allOpen" @click="toggleAll">
        {{ t(allOpen ? 'gear.collapseAll' : 'gear.expandAll') }}
      </button>
    </p>

    <div class="table-wrap">
      <table class="gear">
        <thead>
          <tr>
            <th>{{ t('equip.slot') }}</th>
            <th>{{ t('equip.item') }}</th>
            <th class="num" :title="t('reco.colEquippedTitle')">{{ t('gear.colScore') }}</th>
            <th class="num">{{ t('gear.colBest') }}<Hint :text="t('gear.bestHint')" /></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.slot">
            <tr :class="{ expandable: expandable(r), open: open.has(r.slot) }" @click="onRowClick($event, r)">
              <td class="slot">
                <button
                  v-if="expandable(r)"
                  type="button"
                  class="expand"
                  :aria-expanded="open.has(r.slot)"
                  :aria-label="t('gear.toggle', { slot: r.label })"
                  @click="toggle(r.slot)"
                >▸</button>
                <span v-else class="expand" aria-hidden="true"></span>
                {{ r.label }}
              </td>
              <td class="item">
                <template v-if="r.item">
                  <a
                    :href="wowheadItemUrl(r.item.item.id, r.item.bonus_list?.[0])"
                    target="_blank"
                    rel="noopener"
                    :class="['q', r.item.quality?.type.toLowerCase()]"
                    >{{ r.item.name }}</a
                  >
                  <ItemStats :item="r.item" />
                </template>
                <span v-else class="empty">{{ t('equip.empty') }}</span>
              </td>
              <td class="num">{{ r.score === undefined ? '–' : formatNumber(r.score) }}</td>
              <td class="num best">
                <template v-if="r.gain > 0 && r.best !== undefined">
                  {{ formatNumber(r.best) }} <span class="gain-inline">(+{{ formatNumber(r.gain) }})</span>
                  <span class="bar" :title="`${ratio(r)} %`"><span :style="{ width: `${ratio(r)}%` }"></span></span>
                </template>
                <span v-else-if="r.advice" class="muted small">{{ t('reco.nothing') }}</span>
                <template v-else>–</template>
              </td>
            </tr>
            <!-- Options : sous la colonne « Objet », en retrait, comme une sous-liste de l'objet porté. -->
            <tr v-if="open.has(r.slot) && r.advice" class="options-row">
              <td></td>
              <td colspan="3">
                <ul class="candidates">
                  <CandidateLine
                    v-for="c in r.advice.candidates"
                    :key="itemKey(c.item)"
                    :c="c"
                    :sources="sourcesOf(c.item)"
                    :active-quests="activeQuests"
                    :price="prices?.prices[itemKey(c.item)]"
                    :price-note="priceNote"
                    :prices-loaded="!!prices"
                    :faction-ids="game.factions"
                    :side="side"
                    :crafter="crafter"
                    :reputations="reputations"
                  />
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <p class="muted small">
      {{ footer[0] }}<a :href="game.weights.source.url" target="_blank" rel="noopener">Polestar</a>{{ footer[1] }}
      <template v-if="t('reco.footerNpc')">{{ ' ' + t('reco.footerNpc') }}</template>
    </p>
  </section>
</template>
