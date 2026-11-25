<script setup lang="ts">
// Une option proposée : gain, objet, niveau, arme associée, sources et prix à l'HV.
import { factionName, formatMoney, itemName, professionName, questTitle, subclassName, t, type MessageKey } from '../i18n'
import { wowheadItemUrl, wowheadNpcUrl, wowheadQuestUrl } from '../lib/blizzard'
import type { Candidate, DbItem, Source } from '../lib/recommend'

defineProps<{
  c: Candidate
  sources: Source[]
  activeQuests: ReadonlySet<number>
  /** [prix en cuivre, nombre de maisons] (voir api/prices.ts). */
  price?: [number, number]
  priceNote?: string
}>()

const QUEST_KEY = { dungeon: 'src.questDungeon', raid: 'src.questRaid' } as const

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
    <span class="gain">+{{ c.gain.toFixed(1) }}</span>
    <a :href="wowheadItemUrl(c.item.id)" target="_blank" rel="noopener" :class="['q', c.item.q.toLowerCase()]">{{
      itemName(c.item.id, c.item.n)
    }}</a>
    <span class="muted">
      · <span :title="t(c.item.ale ? 'cand.levelEstimated' : 'cand.levelRequired')">{{ t('cand.level', { level: levelText(c.item) }) }}</span>
      · {{ subclassName(c.item.subn) }}<template v-if="c.with">
        · {{ t('cand.with') }}
        <a :href="wowheadItemUrl(c.with.id)" target="_blank" rel="noopener">{{ itemName(c.with.id, c.with.n) }}</a></template
      >
    </span>
    <div class="sources">
      <template v-for="(s, i) in sources" :key="i">
        <span v-if="s.t === 'craft'" :title="reagentsText(s)">{{ t('src.craft', { prof: professionName(s.prof) }) }}</span>
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
      <span v-if="c.item.rep">{{ t('src.rep', { faction: factionName(c.item.rep[0]), standing: standing(c.item.rep[1]) }) }}</span>
      <template v-if="sources.length === 0 && !c.item.rep">
        <span v-if="!c.item.bop">{{ t('src.boe') }}</span>
        <span v-else class="muted">{{ t('src.unknown') }}</span>
      </template>
      <span v-if="price" :title="priceNote">{{ t('src.ah', { price: formatMoney(price[0]) }) }}</span>
    </div>
  </li>
</template>
