<script setup lang="ts">
import { computed } from 'vue'
import { t, type MessageKey } from '../i18n'
import { wowheadItemUrl, type EquippedItem, type ItemStat } from '../lib/blizzard'
import { SLOT_ORDER } from '../lib/data'

const props = defineProps<{ items: EquippedItem[] }>()

// Ordre de la fiche personnage. Chemise et tabard ne sont listés que s'ils sont portés.
const OPTIONAL = new Set(['SHIRT', 'TABARD'])

const rows = computed(() => {
  const bySlot = new Map(props.items.map((i) => [i.slot.type, i]))
  // Une arme à deux mains occupe aussi la main gauche.
  const twoHanded = bySlot.get('MAIN_HAND')?.inventory_type?.type === 'TWOHWEAPON'
  return SLOT_ORDER.filter((type) => bySlot.has(type) || !(OPTIONAL.has(type) || (type === 'OFF_HAND' && twoHanded))).map((type) => ({
    type,
    label: t(`slot.${type}` as MessageKey),
    item: bySlot.get(type),
  }))
})

const statText = (s: ItemStat) => `${s.value > 0 ? '+' : ''}${s.value} ${s.type?.name ?? t('equip.resistances')}`

/** Dégâts, armure et stats de base (en blanc dans le jeu). */
function baseText(item: EquippedItem): string {
  const parts: string[] = []
  if (item.weapon)
    parts.push(t('equip.dps', { dps: item.weapon.dps.value.toFixed(1), speed: (item.weapon.attack_speed.value / 1000).toFixed(2) }))
  if (item.armor) parts.push(t('equip.armor', { value: item.armor.value }))
  for (const s of item.stats ?? []) if (!s.is_negated && !s.is_equip_bonus) parts.push(statText(s))
  return parts.join(', ')
}

/**
 * Effets (en vert dans le jeu) : stats bonus que l'API marque `is_equip_bonus` (puissance des sorts, puissance
 * d'attaque, défense, bonus contre un type de créature…), puis effets « Equipé / Utiliser / Chances quand vous touchez ».
 */
function effectLines(item: EquippedItem): string[] {
  const bonus = (item.stats ?? []).filter((s) => !s.is_negated && s.is_equip_bonus).map(statText)
  const spells = (item.spells ?? []).map((s) => s.description?.trim()).filter((d): d is string => !!d)
  return [...(bonus.length ? [bonus.join(', ')] : []), ...spells]
}
</script>

<template>
  <section>
    <h3>{{ t('equip.title') }}</h3>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{{ t('equip.slot') }}</th>
            <th>{{ t('equip.item') }}</th>
            <th>{{ t('equip.itemLevel') }}</th>
            <th>{{ t('equip.reqLevel') }}</th>
            <th>{{ t('equip.type') }}</th>
            <th>{{ t('equip.stats') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.type">
            <td>{{ row.label }}</td>
            <template v-if="row.item">
              <td>
                <a :href="wowheadItemUrl(row.item.item.id, row.item.bonus_list?.[0])" target="_blank" rel="noopener" :class="['q', row.item.quality?.type.toLowerCase()]">
                  {{ row.item.name }}
                </a>
              </td>
              <td>{{ row.item.level?.value ?? '–' }}</td>
              <td>{{ row.item.requirements?.level?.value ?? '–' }}</td>
              <td>{{ row.item.item_subclass?.name ?? '–' }}</td>
              <td class="stats">
                <div v-if="baseText(row.item)">{{ baseText(row.item) }}</div>
                <div v-for="(e, i) in effectLines(row.item)" :key="i" class="effect">{{ e }}</div>
              </td>
            </template>
            <td v-else colspan="5" class="empty">{{ t('equip.empty') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
