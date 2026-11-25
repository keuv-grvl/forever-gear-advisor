<script setup lang="ts">
import { computed } from 'vue'
import { wowheadItemUrl, type EquippedItem } from '../lib/blizzard'

const props = defineProps<{ items: EquippedItem[] }>()

// Ordre de la fiche personnage. Chemise et tabard ne sont listés que s'ils sont portés.
const SLOTS: [type: string, label: string][] = [
  ['HEAD', 'Tête'],
  ['NECK', 'Cou'],
  ['SHOULDER', 'Épaules'],
  ['BACK', 'Dos'],
  ['CHEST', 'Torse'],
  ['SHIRT', 'Chemise'],
  ['TABARD', 'Tabard'],
  ['WRIST', 'Poignets'],
  ['HANDS', 'Mains'],
  ['WAIST', 'Taille'],
  ['LEGS', 'Jambes'],
  ['FEET', 'Pieds'],
  ['FINGER_1', 'Doigt 1'],
  ['FINGER_2', 'Doigt 2'],
  ['TRINKET_1', 'Bijou 1'],
  ['TRINKET_2', 'Bijou 2'],
  ['MAIN_HAND', 'Main droite'],
  ['OFF_HAND', 'Main gauche'],
  ['RANGED', 'Distance'],
]
const OPTIONAL = new Set(['SHIRT', 'TABARD'])

const rows = computed(() => {
  const bySlot = new Map(props.items.map((i) => [i.slot.type, i]))
  // Une arme à deux mains occupe aussi la main gauche.
  const twoHanded = bySlot.get('MAIN_HAND')?.inventory_type?.type === 'TWOHWEAPON'
  return SLOTS.filter(([type]) => bySlot.has(type) || !(OPTIONAL.has(type) || (type === 'OFF_HAND' && twoHanded))).map(
    ([type, label]) => ({ type, label, item: bySlot.get(type) }),
  )
})

function statsText(item: EquippedItem): string {
  const parts: string[] = []
  if (item.weapon) parts.push(`${item.weapon.dps.value.toFixed(1)} DPS (${(item.weapon.attack_speed.value / 1000).toFixed(2)})`)
  if (item.armor) parts.push(`${item.armor.value} armure`)
  for (const s of item.stats ?? []) if (!s.is_negated) parts.push(`${s.value > 0 ? '+' : ''}${s.value} ${s.type.name}`)
  return parts.join(', ')
}
</script>

<template>
  <section>
    <h3>Équipement</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Slot</th>
            <th>Objet</th>
            <th>Niv. objet</th>
            <th>Niv. requis</th>
            <th>Type</th>
            <th>Caractéristiques</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.type">
            <td>{{ row.label }}</td>
            <template v-if="row.item">
              <td>
                <a :href="wowheadItemUrl(row.item.item.id)" target="_blank" rel="noopener" :class="['q', row.item.quality?.type.toLowerCase()]">
                  {{ row.item.name }}
                </a>
              </td>
              <td>{{ row.item.level?.value ?? '–' }}</td>
              <td>{{ row.item.requirements?.level?.value ?? '–' }}</td>
              <td>{{ row.item.item_subclass?.name ?? '–' }}</td>
              <td class="stats">{{ statsText(row.item) }}</td>
            </template>
            <td v-else colspan="5" class="empty">vide</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
