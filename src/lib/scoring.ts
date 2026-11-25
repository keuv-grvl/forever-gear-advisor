// Score d'un objet = Σ(stat × poids de la spé au niveau du perso) + armure + DPS d'arme.
// Poids : public/data/weights.json (Polestar, GPL-3.0), par tranche de niveau.

export interface SpecWeights {
  class: string
  spec: string
  role: 'dps' | 'tank' | 'healer'
  weights: Record<string, (number | null)[]>
}

export interface WeightsFile {
  source: { name: string; url: string; license: string }
  levels: number[]
  specs: SpecWeights[]
}

/** Objet ramené à ce qui compte pour le score, qu'il vienne du profil ou de items.json. */
export interface ScorableItem {
  slot: string // inventory_type Blizzard
  stats: Record<string, number>
  armor: number
  dps: number
}

// Forever exprime crit, toucher, hâte… en points de rating ; les poids sont par 1 %.
// Points de rating pour 1 %, identiques à tous les niveaux (client Forever, gametables/combatratings,
// d'après la doc de Polestar). Le rating de critique / toucher est générique : il compte en physique et en sorts.
const RATING_PER_PCT = { CRIT: 14, HIT: 10, HASTE: 10, EXPERTISE: 10, ARMOR_PENETRATION: 10, DODGE: 12, PARRY: 15, BLOCK: 5 }

// Type de stat Blizzard → [clé de poids, diviseur]. SPELL_POWER (dégâts et soins) compte pour les deux.
const STAT_KEYS: Record<string, [key: string, per: number][]> = {
  STRENGTH: [['STRENGTH', 1]],
  AGILITY: [['AGILITY', 1]],
  STAMINA: [['STAMINA', 1]],
  INTELLECT: [['INTELLECT', 1]],
  SPIRIT: [['SPIRIT', 1]],
  ATTACK_POWER: [['ATTACK_POWER', 1]],
  RANGED_ATTACK_POWER: [['RANGED_ATTACK_POWER', 1]],
  SPELL_POWER: [['SPELL_DAMAGE', 1], ['HEALING', 1]],
  SPELL_DAMAGE_DONE: [['SPELL_DAMAGE', 1]],
  SPELL_HEALING_DONE: [['HEALING', 1]],
  BONUS_STAT_ARCANE_DAMAGE_DONE: [['ARCANE_DAMAGE', 1]],
  BONUS_STAT_FIRE_DAMAGE_DONE: [['FIRE_DAMAGE', 1]],
  BONUS_STAT_FROST_DAMAGE_DONE: [['FROST_DAMAGE', 1]],
  BONUS_STAT_HOLY_DAMAGE_DONE: [['HOLY_DAMAGE', 1]],
  BONUS_STAT_NATURE_DAMAGE_DONE: [['NATURE_DAMAGE', 1]],
  BONUS_STAT_SHADOW_DAMAGE_DONE: [['SHADOW_DAMAGE', 1]],
  CRIT_RATING: [['CRIT', RATING_PER_PCT.CRIT], ['SPELL_CRIT', RATING_PER_PCT.CRIT]],
  HIT_RATING: [['HIT', RATING_PER_PCT.HIT], ['SPELL_HIT', RATING_PER_PCT.HIT]],
  HASTE_RATING: [['HASTE', RATING_PER_PCT.HASTE]],
  EXPERTISE_RATING: [['EXPERTISE', RATING_PER_PCT.EXPERTISE]],
  ARMOR_PENETRATION_RATING: [['ARMOR_PENETRATION', RATING_PER_PCT.ARMOR_PENETRATION]],
  DEFENSE_SKILL_RATING: [['DEFENSE', 1]],
  DODGE_RATING: [['DODGE', RATING_PER_PCT.DODGE]],
  PARRY_RATING: [['PARRY', RATING_PER_PCT.PARRY]],
  BLOCK_RATING: [['BLOCK', RATING_PER_PCT.BLOCK]],
  BLOCK_VALUE: [['BLOCK_VALUE', 1]],
  HEALTH_REGEN: [['HEALTH_REGEN', 1]],
  MANA_REGENERATION: [['MANA_REGEN', 1]],
  EXTRA_ARMOR: [['ARMOR', 1]],
  HEALTH: [['HEALTH', 1]],
  MANA: [['MANA', 1]],
}

/** Stats sans poids (résistances, bonus « contre les Bêtes »…) : comptées pour rien, mais signalées. */
export function unweightedStats(item: ScorableItem): string[] {
  return Object.keys(item.stats).filter((k) => !STAT_KEYS[k])
}

const RANGED_SLOTS = new Set(['RANGED', 'RANGEDRIGHT', 'THROWN'])

export function findSpec(file: WeightsFile, className: string, specName?: string): SpecWeights | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/ combat$/, '') // « Feral Combat » → « feral »
  const ofClass = file.specs.filter((s) => s.class.toLowerCase() === className.toLowerCase())
  return (specName && ofClass.find((s) => norm(s.spec) === norm(specName))) || ofClass[0]
}

/** Poids de la spé pour un niveau : colonne de la tranche Polestar (moins de 25, 25-39, 40-49, 50-59, 60). */
export function weightsAt(file: WeightsFile, spec: SpecWeights, level: number): Record<string, number> {
  const col = level < 15 ? 10 : level < 25 ? 20 : level < 40 ? 30 : level < 50 ? 40 : level < 60 ? 50 : 60
  const i = Math.max(0, file.levels.indexOf(col))
  const w: Record<string, number> = {}
  for (const [k, values] of Object.entries(spec.weights)) w[k] = values[i] ?? 0
  // Règle Polestar : un DPS d'arme minimal départage les armes même pour un lanceur de sorts.
  if (!w.WEAPON_DPS) w.WEAPON_DPS = 0.01
  return w
}

/**
 * Score d'un objet. `asOffHand` : arme portée en main gauche, comptée à la moitié du poids de la main droite
 * (pénalité de dégâts de la main gauche, règle Polestar).
 */
export function scoreItem(item: ScorableItem, w: Record<string, number>, asOffHand = false): number {
  let score = 0
  for (const [type, value] of Object.entries(item.stats)) {
    for (const [key, per] of STAT_KEYS[type] ?? []) score += (value / per) * (w[key] ?? 0)
  }
  score += item.armor * (w.ARMOR ?? 0)
  if (item.dps) {
    const dpsWeight = RANGED_SLOTS.has(item.slot) ? (w.RANGED_WEAPON_DPS ?? 0) : (w.WEAPON_DPS ?? 0) * (asOffHand ? 0.5 : 1)
    score += item.dps * dpsWeight
  }
  return Math.round(score * 10) / 10
}
