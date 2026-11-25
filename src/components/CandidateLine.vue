<script setup lang="ts">
// Une option proposée : gain, objet, niveau, arme associée et sources.
import { wowheadItemUrl, wowheadNpcUrl, wowheadQuestUrl } from '../lib/blizzard'
import type { Candidate, DbItem, Source } from '../lib/recommend'

defineProps<{ c: Candidate; sources: Source[]; activeQuests: ReadonlySet<number> }>()

const STANDINGS = ['Détesté', 'Hostile', 'Inamical', 'Neutre', 'Amical', 'Honoré', 'Révéré', 'Exalté']
const QUEST_LABEL = { dungeon: 'Quête de donjon', raid: 'Quête de raid' }

function reagentsText(s: Extract<Source, { t: 'craft' }>): string {
  return s.reagents.map(([, name, qty]) => `${qty} × ${name}`).join(', ')
}

function levelText(item: DbItem): string {
  if (item.al === undefined) return '?'
  return item.ale ? `~${item.al}` : String(item.al)
}
</script>

<template>
  <li>
    <span class="gain">+{{ c.gain.toFixed(1) }}</span>
    <a :href="wowheadItemUrl(c.item.id)" target="_blank" rel="noopener" :class="['q', c.item.q.toLowerCase()]">{{ c.item.n }}</a>
    <span class="muted">
      · <span :title="c.item.ale ? 'Niveau estimé : l\'API ne donne pas de niveau requis' : 'Niveau requis'">niv {{ levelText(c.item) }}</span>
      · {{ c.item.subn }}<template v-if="c.with">
        · avec <a :href="wowheadItemUrl(c.with.id)" target="_blank" rel="noopener">{{ c.with.n }}</a></template
      >
    </span>
    <div class="sources">
      <template v-for="(s, i) in sources" :key="i">
        <span v-if="s.t === 'craft'" :title="reagentsText(s)">Craft : {{ s.prof }}</span>
        <span v-else-if="s.t === 'vendor'">
          Vendeur :
          <a :href="wowheadNpcUrl(s.npc)" target="_blank" rel="noopener">{{ s.name }}</a>
          <template v-if="s.sub"> ({{ s.sub }})</template>
        </span>
        <span v-else>
          {{ s.inst ? QUEST_LABEL[s.inst] : 'Quête' }} :
          <a :href="wowheadQuestUrl(s.id)" target="_blank" rel="noopener">{{ s.title ?? `#${s.id}` }}</a>
          <template v-if="s.min ?? s.lvl"> (niv {{ s.min ?? s.lvl }})</template>
          <strong v-if="activeQuests.has(s.id)" class="badge">en cours</strong>
        </span>
      </template>
      <span v-if="c.item.rep">Réputation : {{ c.item.rep[0] }} ({{ STANDINGS[c.item.rep[1]] ?? c.item.rep[1] }})</span>
      <span v-if="sources.length === 0 && !c.item.rep" class="muted">source inconnue, voir Wowhead</span>
    </div>
  </li>
</template>
