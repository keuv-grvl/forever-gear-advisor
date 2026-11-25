// PROTOTYPE LOCAL : score avec les poids de l'addon Forever Leveling BiS (Thunder). Ses poids ne sont chargés qu'en
// développement, depuis public/data/local/ (non versionné, voir scripts/convert-flbis.ts) : leur copie demande la
// permission écrite de l'auteur. Formule de leur API publique (github.com/thunder426/ForeverLevelingBiS-API) :
// Σ stat × poids, DPS d'arme × poids de la main, et (vitesse − référence) × 10 × poids de vitesse ; DPS et vitesse
// ensemble jamais sous 0.

import type { ScorableItem, Scorer } from './scoring'

export interface FlbisBracket {
  upTo: number
  stats: Record<string, number>
}
interface FlbisSpec {
  brackets: FlbisBracket[]
  /** Configurations d'armes avec leurs propres poids (Amélioration : shield) ; les brackets du spé sont « twohand ». */
  setups?: Record<string, { brackets: FlbisBracket[] }>
}
export interface FlbisFile {
  generated: string
  source: string
  /** Classe (WARRIOR…) → spé (arms, beastmastery, bear…). */
  weights: Record<string, Record<string, FlbisSpec>>
}

// Types de stat de l'API Blizzard → clés de l'addon (stats Wowhead), par point.
const KEYS: Record<string, string> = {
  STRENGTH: 'str',
  AGILITY: 'agi',
  STAMINA: 'sta',
  INTELLECT: 'int',
  SPIRIT: 'spi',
  ATTACK_POWER: 'atkpwr',
  RANGED_ATTACK_POWER: 'rgdatkpwr',
  SPELL_POWER: 'splpwr',
  SPELL_DAMAGE_DONE: 'spldmg',
  SPELL_HEALING_DONE: 'splheal',
  BONUS_STAT_ARCANE_DAMAGE_DONE: 'arcsplpwr',
  BONUS_STAT_FIRE_DAMAGE_DONE: 'firsplpwr',
  BONUS_STAT_FROST_DAMAGE_DONE: 'frosplpwr',
  BONUS_STAT_HOLY_DAMAGE_DONE: 'holsplpwr',
  BONUS_STAT_NATURE_DAMAGE_DONE: 'natsplpwr',
  BONUS_STAT_SHADOW_DAMAGE_DONE: 'shasplpwr',
  HASTE_RATING: 'hastertng',
  DEFENSE_SKILL_RATING: 'defrtng',
  BLOCK_VALUE: 'block',
  MANA_REGENERATION: 'manargn',
  HEALTH_REGEN: 'healthrgn',
  SPELL_PENETRATION: 'splpen',
  EXTRA_ARMOR: 'armorbonus',
}
// Sur Forever, toucher, critique, expertise, esquive, parade et blocage d'équipement sont des « +X % » ; l'API les
// donne en points (10 de toucher = 1 %, 14 de critique…, mêmes conversions que src/lib/scoring.ts) : on repasse en %.
const PCT_KEYS: Record<string, [key: string, perPct: number]> = {
  HIT_RATING: ['hitPct', 10],
  CRIT_RATING: ['critPct', 14],
  EXPERTISE_RATING: ['expPct', 10],
  DODGE_RATING: ['dodgePct', 12],
  PARRY_RATING: ['parryPct', 15],
  BLOCK_RATING: ['blockPct', 5],
}
const RANGED_SLOTS = new Set(['RANGED', 'RANGEDRIGHT', 'THROWN'])
// Vitesse de référence quand la tranche n'en donne pas (addon : ns.SPEED_REF).
const SPEED_REF = { twoHand: 3.3, ranged: 2.8, other: 2.4 }

/** Clé de spé de l'addon : « Beast Mastery » → beastmastery, « Feral Combat » → feral. */
export const flbisSpecKey = (name: string) => name.toLowerCase().replace(/ combat$/, '').replace(/[^a-z]/g, '')

/** Spés de l'addon pour une classe (clé anglaise « Shaman »). */
export function flbisSpecs(file: FlbisFile, classKey: string): string[] {
  return Object.keys(file.weights[classKey.toUpperCase()] ?? {})
}

/** Configurations d'armes du spé : twohand (poids par défaut) puis les autres, s'il en a. */
export function flbisSetups(file: FlbisFile, classKey: string, spec: string): string[] {
  const s = file.weights[classKey.toUpperCase()]?.[spec]
  return s?.setups ? ['twohand', ...Object.keys(s.setups)] : []
}

/** Poids de la tranche du niveau (la première qui l'atteint, sinon la dernière), pour la configuration d'armes. */
export function flbisWeights(file: FlbisFile, classKey: string, spec: string, level: number, setup?: string) {
  const s = file.weights[classKey.toUpperCase()]?.[spec]
  if (!s) return undefined
  const brackets = (setup && s.setups?.[setup]?.brackets) || s.brackets
  return (brackets.find((b) => level <= b.upTo) ?? brackets[brackets.length - 1])?.stats
}

/**
 * `setup` : configuration d'armes des poids. En `shield`, la vitesse a été mesurée sur une arme à une main : elle ne
 * compte pas pour une arme à deux mains (portée, ou comparée), qui n'est notée que sur son DPS.
 */
export function flbisScorer(w: Record<string, number>, setup?: string): Scorer {
  return (item: ScorableItem, asOffHand = false) => {
    let score = 0
    for (const [type, value] of Object.entries(item.stats)) {
      const pct = PCT_KEYS[type]
      if (pct) score += (value / pct[1]) * (w[pct[0]] ?? 0)
      else score += value * (w[KEYS[type]] ?? 0)
    }
    score += item.armor * (w.armor ?? 0)
    if (item.dps) {
      const ranged = RANGED_SLOTS.has(item.slot)
      const [dpsKey, speedKey] = ranged ? ['rangedDps', 'rangedSpeed'] : asOffHand ? ['ohDps', 'ohSpeed'] : ['dps', 'speed']
      // Main gauche sans poids propre : moitié de la main droite (pénalité de dégâts).
      const dpsWeight = w[dpsKey] ?? (asOffHand ? (w.dps ?? 0) / 2 : 0)
      let weapon = item.dps * dpsWeight
      const speedWeight = w[speedKey]
      if (speedWeight && item.speed && !(setup === 'shield' && item.slot === 'TWOHWEAPON')) {
        const ref = w[`${speedKey}Ref`] ?? (item.slot === 'TWOHWEAPON' ? SPEED_REF.twoHand : ranged ? SPEED_REF.ranged : SPEED_REF.other)
        weapon += (item.speed - ref) * 10 * speedWeight
      }
      score += Math.max(0, weapon)
    }
    return Math.round(score * 10) / 10
  }
}
