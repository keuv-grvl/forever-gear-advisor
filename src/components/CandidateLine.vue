<script setup lang="ts">
import { computed } from 'vue'
// Une option proposée : gain, objet, niveau, arme associée, sources et prix à l'HV.
import { factionName, formatMoney, formatNumber, itemEffects, itemName, professionName, questTitle, subclassName, suffixedName, t, type MessageKey } from '../i18n'
import { wowheadFactionUrl, wowheadItemUrl, wowheadNpcUrl, wowheadQuestUrl, type Reputation } from '../lib/blizzard'
import type { Candidate, Crafter, DbItem, Source } from '../lib/recommend'

const props = defineProps<{
  c: Candidate
  sources: Source[]
  activeQuests: ReadonlySet<number>
  /** [prix en cuivre, nombre de maisons] (voir api/prices.ts). */
  price?: [number, number]
  priceNote?: string
  /** Camp du perso : la faction requise peut en dépendre (récompenses du Goulet des Chanteguerres). */
  side: 'A' | 'H'
  /** Métiers du perso (absent : inconnus). */
  crafter?: Crafter
  /** Réputations du perso, par nom anglais de faction (absent : inconnues). */
  reputations?: ReadonlyMap<string, Reputation>
  /** Prix de l'HV chargés : sans prix, un craft lié quand équipé n'est pas en vente. */
  pricesLoaded?: boolean
  /** Id des factions (nom anglais → id), pour le lien Wowhead. */
  factionIds?: Record<string, number>
}>()

/** Craft lié quand équipé : on indique son prix à l'HV, ou qu'il n'y est pas. */
const tradableCraft = computed(() => !props.c.item.bop && props.sources.some((s) => s.t === 'craft'))

// Points de réputation (depuis le début de Neutre) où commence chaque rang : Détesté … Exalté.
const REP_START = [-42000, -6000, -3000, 0, 3000, 9000, 21000, 42000]

// Faction de la réputation requise (côté Horde si elle diffère) : nom anglais, nom affiché, lien Wowhead.
const repFactionEn = computed(() => {
  const r = props.c.item.rep
  return r ? (props.side === 'H' && r[2]) || r[0] : ''
})
const repFaction = computed(() => (repFactionEn.value ? factionName(repFactionEn.value) : ''))
const repFactionUrl = computed(() => {
  const id = props.factionIds?.[repFactionEn.value]
  return id ? wowheadFactionUrl(id) : undefined
})
/** Texte traduit coupé autour de {faction}, pour y mettre le lien. */
const aroundFaction = (text: string) => {
  const i = text.indexOf('{faction}')
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + '{faction}'.length)]
}

/**
 * Réputation requise, en court : « atteinte » ou les points qui manquent, envers la faction. Le détail (rang requis,
 * rang du perso) va dans l'infobulle.
 */
const repStatus = computed(() => {
  const r = props.c.item.rep
  if (!r || !props.reputations) return null
  const cur = props.reputations.get(repFactionEn.value)
  const required = t('src.repRequired', { standing: standing(r[1]) })
  const title = `${required} · ${cur ? t('src.repCurrent', { standing: standing(cur.tier), value: cur.value, max: cur.max }) : t('src.repNever')}`
  if (cur && cur.tier >= r[1]) return { met: true, parts: aroundFaction(t('src.repMet')), title }
  const missing = formatNumber(Math.max(0, (REP_START[r[1]] ?? 0) - (cur?.raw ?? 0)), 0)
  return { met: false, parts: aroundFaction(t('src.repMissing', { missing })), title }
})

/** Effets de l'objet dans la langue (« Equipé : … »). */
const effects = computed(() => itemEffects(props.c.item.id, props.c.item.sp ?? []).map((e) => e.trim()).filter(Boolean))

const QUEST_KEY = { dungeon: 'src.questDungeon', raid: 'src.questRaid' } as const

/** Précision sur un craft : recette connue ou à apprendre (métier du perso), sinon à faire fabriquer. */
function craftNote(s: Extract<Source, { t: 'craft' }>): string {
  const c = props.crafter
  if (!c || s.pid === undefined) return ''
  if (!c.professions.has(s.pid)) return t('src.craftOther')
  if (s.rid === undefined) return ''
  return t(c.recipes.has(s.rid) ? 'src.craftKnown' : 'src.craftToLearn')
}

function reagentsText(s: Extract<Source, { t: 'craft' }>): string {
  return s.reagents.map(([id, name, qty]) => `${qty} × ${itemName(id, name)}`).join(', ')
}

function levelText(item: DbItem): string {
  if (item.al === undefined) return '?'
  return item.ale ? `~${item.al}` : String(item.al)
}

const standing = (n: number) => (n >= 0 && n <= 7 ? t(`standing.${n}` as MessageKey) : String(n))
</script>

<template>
  <li>
    <span class="gain">+{{ formatNumber(c.gain) }}</span>
    <a :href="wowheadItemUrl(c.item.id, c.item.sfx)" target="_blank" rel="noopener" :class="['q', c.item.q.toLowerCase()]">{{
      c.item.sfx ? suffixedName(c.item.id, c.item.sfx, c.item.n) : itemName(c.item.id, c.item.n)
    }}</a>
    <span class="muted">
      · <span :title="t(c.item.ale ? 'cand.levelEstimated' : 'cand.levelRequired')">{{ t('cand.level', { level: levelText(c.item) }) }}</span>
      · {{ subclassName(c.item.subn) }}<template v-if="c.with">
        · {{ t('cand.with') }}
        <a :href="wowheadItemUrl(c.with.id)" target="_blank" rel="noopener">{{ itemName(c.with.id, c.with.n) }}</a></template
      >
    </span>
    <!-- Effets (« Equipé : … ») : en vert comme en jeu ; le score ne compte que les stats. -->
    <div v-for="(e, i) in effects" :key="i" class="effect">
      {{ e }}<span v-if="i === effects.length - 1" class="muted">{{ ' (' + t('cand.effectNotScored') + ')' }}</span>
    </div>
    <div class="sources">
      <template v-for="(s, i) in sources" :key="i">
        <span v-if="s.t === 'craft'" :title="reagentsText(s)"
          >{{ t('src.craft', { prof: professionName(s.prof) }) }}<span v-if="craftNote(s)" class="muted">{{
            ' (' + craftNote(s) + ')'
          }}</span></span
        >
        <span v-else-if="s.t === 'vendor'">
          {{ t('src.vendor') }}
          <a :href="wowheadNpcUrl(s.npc)" target="_blank" rel="noopener" :title="s.sub">{{ s.name }}</a>
        </span>
        <span v-else>
          {{ t(s.inst ? QUEST_KEY[s.inst] : 'src.quest') }}
          <a :href="wowheadQuestUrl(s.id)" target="_blank" rel="noopener">{{ questTitle(s.id, s.title ?? `#${s.id}`) }}</a>
          <template v-if="s.min ?? s.lvl">{{ ' ' + t('src.questLevel', { level: (s.min ?? s.lvl)! }) }}</template>
          <strong v-if="activeQuests.has(s.id)" class="badge">{{ t('src.inProgress') }}</strong>
        </span>
      </template>
      <!-- Réputation : faction et points manquants (détail en infobulle) ; rang requis seul si on ne connaît pas
           les réputations du perso. -->
      <span v-if="c.item.rep && repStatus" :title="repStatus.title" :class="repStatus.met ? 'rep-ok' : 'rep-todo'"
        >{{ repStatus.parts[0] }}<a v-if="repFactionUrl" :href="repFactionUrl" target="_blank" rel="noopener">{{ repFaction }}</a
        ><template v-else>{{ repFaction }}</template>{{ repStatus.parts[1] }}</span
      >
      <span v-else-if="c.item.rep"
        >{{ aroundFaction(t('src.rep', { standing: standing(c.item.rep[1]) }))[0]
        }}<a v-if="repFactionUrl" :href="repFactionUrl" target="_blank" rel="noopener">{{ repFaction }}</a
        ><template v-else>{{ repFaction }}</template>{{ aroundFaction(t('src.rep', { standing: standing(c.item.rep[1]) }))[1] }}</span
      >
      <template v-if="sources.length === 0 && !c.item.rep">
        <span v-if="c.item.sfx" :title="t('src.randomNote')">{{ t('src.random') }}</span>
        <span v-else-if="!c.item.bop">{{ t('src.boe') }}</span>
        <span v-else class="muted">{{ t('src.unknown') }}</span>
      </template>
      <span v-if="price" :title="priceNote">{{ t('src.ah', { price: formatMoney(price[0]) }) }}</span>
      <span v-else-if="pricesLoaded && tradableCraft" class="muted">{{ t('src.notOnAh') }}</span>
    </div>
  </li>
</template>
