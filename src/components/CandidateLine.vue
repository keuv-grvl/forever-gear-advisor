<script setup lang="ts">
import { computed } from 'vue'
// Une option proposée : gain, objet, niveau, arme associée, sources et prix à l'HV.
import { factionName, formatMoney, formatNumber, itemEffects, itemName, professionName, questTitle, subclassName, suffixedName, t, type MessageKey } from '../i18n'
import { wowheadItemUrl, wowheadNpcUrl, wowheadQuestUrl } from '../lib/blizzard'
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
}>()

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
          <a :href="wowheadNpcUrl(s.npc)" target="_blank" rel="noopener">{{ s.name }}</a>
          <template v-if="s.sub"> ({{ s.sub }})</template>
        </span>
        <span v-else>
          {{ t(s.inst ? QUEST_KEY[s.inst] : 'src.quest') }}
          <a :href="wowheadQuestUrl(s.id)" target="_blank" rel="noopener">{{ questTitle(s.id, s.title ?? `#${s.id}`) }}</a>
          <template v-if="s.min ?? s.lvl">{{ ' ' + t('src.questLevel', { level: (s.min ?? s.lvl)! }) }}</template>
          <strong v-if="activeQuests.has(s.id)" class="badge">{{ t('src.inProgress') }}</strong>
        </span>
      </template>
      <span v-if="c.item.rep">{{
        t('src.rep', { faction: factionName((props.side === 'H' && c.item.rep[2]) || c.item.rep[0]), standing: standing(c.item.rep[1]) })
      }}</span>
      <template v-if="sources.length === 0 && !c.item.rep">
        <span v-if="c.item.sfx" :title="t('src.randomNote')">{{ t('src.random') }}</span>
        <span v-else-if="!c.item.bop">{{ t('src.boe') }}</span>
        <span v-else class="muted">{{ t('src.unknown') }}</span>
      </template>
      <span v-if="price" :title="priceNote">{{ t('src.ah', { price: formatMoney(price[0]) }) }}</span>
    </div>
  </li>
</template>
