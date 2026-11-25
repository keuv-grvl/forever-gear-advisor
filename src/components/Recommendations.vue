<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { detectSpec, wowheadItemUrl, wowheadQuestUrl, type CharacterData } from '../lib/blizzard'
import { SLOT_LABELS, type GameData } from '../lib/data'
import { recommend, type DbItem, type Source } from '../lib/recommend'
import { findSpec, weightsAt } from '../lib/scoring'

const props = defineProps<{ data: CharacterData; game: GameData }>()
const game = computed(() => props.game)

const profile = computed(() => props.data.profile)
const specChoices = computed(() => game.value?.weights.specs.filter((s) => s.class === profile.value.character_class.name) ?? [])
const specName = ref('')
const anticipate = ref(false)
const mainArmorOnly = ref(true)

// Spé détectée par défaut, à chaque nouveau perso.
watch(
  () => [props.data, game.value] as const,
  () => {
    if (!game.value) return
    const detected = detectSpec(props.data.specializations)
    specName.value = findSpec(game.value.weights, profile.value.character_class.name, detected?.name)?.spec ?? ''
  },
  { immediate: true },
)

const spec = computed(() => (game.value ? findSpec(game.value.weights, profile.value.character_class.name, specName.value) : undefined))

const advice = computed(() => {
  if (!game.value || !spec.value) return []
  return recommend(props.data.equipment.equipped_items, game.value.items, {
    classId: profile.value.character_class.id,
    level: profile.value.level,
    faction: profile.value.faction.type,
    weights: weightsAt(game.value.weights, spec.value, profile.value.level),
    anticipate: anticipate.value ? 5 : 0,
    perSlot: 3,
    mainArmorOnly: mainArmorOnly.value,
  })
})

const SIDE = { ALLIANCE: 1, HORDE: 2 } as Record<string, number>

function sourcesOf(item: DbItem): Source[] {
  const mySide = SIDE[profile.value.faction.type]
  // Quêtes de l'autre faction écartées (side 0 = les deux).
  return (game.value?.sources[item.id] ?? []).filter((s) => s.t !== 'quest' || !s.side || s.side === mySide)
}

function reagentsText(s: Extract<Source, { t: 'craft' }>): string {
  return s.reagents.map(([, name, qty]) => `${qty} × ${name}`).join(', ')
}

function levelText(item: DbItem): string {
  if (item.al === undefined) return '?'
  return item.ale ? `~${item.al}` : String(item.al)
}
</script>

<template>
  <section>
    <h3>Améliorations</h3>
    <template v-if="game">
      <div class="controls">
        <label>
          Spé
          <select v-model="specName">
            <option v-for="s in specChoices" :key="s.spec" :value="s.spec">{{ s.spec }}{{ s.role !== 'dps' ? ` (${s.role})` : '' }}</option>
          </select>
        </label>
        <label><input v-model="mainArmorOnly" type="checkbox" /> Type d'armure principal seulement</label>
        <label><input v-model="anticipate" type="checkbox" /> Anticiper (+5 niveaux)</label>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Équipé (score)</th>
              <th>Meilleures options</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in advice" :key="a.slot">
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
                <ul v-else class="candidates">
                  <li v-for="c in a.candidates" :key="c.item.id">
                    <span class="gain">+{{ c.gain.toFixed(1) }}</span>
                    <a :href="wowheadItemUrl(c.item.id)" target="_blank" rel="noopener" :class="['q', c.item.q.toLowerCase()]">{{ c.item.n }}</a>
                    <span class="muted">
                      · niv {{ levelText(c.item) }} · {{ c.item.subn }}<template v-if="c.with">
                        · avec <a :href="wowheadItemUrl(c.with.id)" target="_blank" rel="noopener">{{ c.with.n }}</a></template
                      >
                    </span>
                    <div class="sources">
                      <template v-for="(s, i) in sourcesOf(c.item)" :key="i">
                        <span v-if="s.t === 'craft'" :title="reagentsText(s)">Craft : {{ s.prof }}</span>
                        <span v-else>
                          Quête :
                          <a :href="wowheadQuestUrl(s.id)" target="_blank" rel="noopener">{{ s.title ?? `#${s.id}` }}</a>
                          <template v-if="s.min ?? s.lvl"> (niv {{ s.min ?? s.lvl }})</template>
                        </span>
                      </template>
                      <span v-if="sourcesOf(c.item).length === 0" class="muted">source inconnue, voir Wowhead</span>
                    </div>
                  </li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="muted small">
        Score : somme des stats pondérées pour la spé (poids
        <a :href="game.weights.source.url" target="_blank" rel="noopener">Polestar</a>, GPL-3.0). Le gain est l'écart avec l'objet
        porté. « ~ » : niveau estimé, l'API ne donne pas de niveau requis. Objets : API Blizzard WoW Forever ({{ game.generated }}) ;
        quêtes : forever-db (Polestar). Les objets à suffixe aléatoire (« of the Owl ») et les drops ne sont pas proposés.
      </p>
    </template>
  </section>
</template>
