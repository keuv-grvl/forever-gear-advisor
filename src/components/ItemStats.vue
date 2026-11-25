<script setup lang="ts">
// Stats d'un objet porté : dégâts, armure et stats de base, puis les effets en vert comme dans l'infobulle du jeu.
import { computed } from 'vue'
import { formatNumber, t } from '../i18n'
import type { EquippedItem, ItemStat } from '../lib/blizzard'

const props = defineProps<{ item: EquippedItem }>()

// Stats bonus (en vert dans le jeu) : l'API y met l'Esprit, qu'on range avec les stats de base (choix de l'utilisateur).
const isBonus = (s: ItemStat) => !!s.is_equip_bonus && s.type?.type !== 'SPIRIT'
const statText = (s: ItemStat) => `${s.value > 0 ? '+' : ''}${s.value} ${s.type?.name ?? t('equip.resistances')}`

/** Dégâts, armure et stats de base (en blanc dans le jeu). */
const base = computed(() => {
  const it = props.item
  const parts: string[] = []
  if (it.weapon)
    parts.push(t('equip.dps', { dps: formatNumber(it.weapon.dps.value, 1), speed: formatNumber(it.weapon.attack_speed.value / 1000, 2) }))
  if (it.armor) parts.push(t('equip.armor', { value: it.armor.value }))
  for (const s of it.stats ?? []) if (!s.is_negated && !isBonus(s)) parts.push(statText(s))
  return parts.join(', ')
})

/**
 * Effets : stats bonus que l'API marque `is_equip_bonus` (puissance des sorts, puissance d'attaque, défense, bonus
 * contre un type de créature…, sauf l'Esprit), puis effets « Equipé / Utiliser / Chances quand vous touchez ».
 */
const effects = computed(() => {
  const bonus = (props.item.stats ?? []).filter((s) => !s.is_negated && isBonus(s)).map(statText)
  const spells = (props.item.spells ?? []).map((s) => s.description?.trim()).filter((d): d is string => !!d)
  return [...(bonus.length ? [bonus.join(', ')] : []), ...spells]
})
</script>

<template>
  <div class="item-stats">
    <div v-if="base">{{ base }}</div>
    <div v-for="(e, i) in effects" :key="i" class="effect">{{ e }}</div>
  </div>
</template>
