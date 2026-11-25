// Client navigateur : passe toujours par /api (jamais d'appel direct à Blizzard).

import { wowheadUrl } from '../i18n'

export const REGIONS = ['eu', 'us', 'kr', 'tw'] as const
export type Region = (typeof REGIONS)[number]

interface Named {
  id: number
  name: string
}
interface Typed {
  type: string
  name: string
}

export interface CharacterProfile {
  id: number
  name: string
  surname: string
  level: number
  faction: Typed
  race: Named
  character_class: Named
  guild?: Named & { slug?: string }
  name_search?: string // « Helga Tartine »
  ruleset?: Named
  // Absents pour certains persos : l'API Forever ne garantit pas ces champs.
  average_item_level?: number
  equipped_item_level?: number
  last_login_timestamp?: number
}

export interface ItemStat {
  type?: Typed // absent pour « +X à toutes les résistances »
  value: number
  is_equip_bonus?: boolean
  is_negated?: boolean
}

// Seuls item, slot et name sont garantis. Ex. : `pal-ouffette` n'a `level` sur aucun objet.
export interface EquippedItem {
  item: { id: number }
  /** Suffixe aléatoire (« of the Whale »). */
  bonus_list?: number[]
  slot: Typed
  quality?: Typed
  name: string
  item_class?: Named
  item_subclass?: Named
  inventory_type?: Typed
  armor?: { value: number }
  stats?: ItemStat[]
  spells?: { spell: Named; description: string }[]
  requirements?: { level?: { value: number } }
  level?: { value: number }
  weapon?: {
    damage: { min_value: number; max_value: number }
    attack_speed: { value: number }
    dps: { value: number }
  }
}

export interface Equipment {
  equipped_items: EquippedItem[]
}

export interface Specializations {
  specialization_groups: {
    is_active: boolean
    // name : nom anglais (clé des poids Polestar) ; label : nom dans la langue demandée (api/character.ts).
    specializations: { specialization: Named & { label?: string }; spent_points: number }[]
  }[]
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** « Helga Tartine », « HELGA_tartine » → « helga-tartine », le format attendu par l'API Forever. */
export function normalizeCharacterName(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidCharacterName(name: string): boolean {
  return /^\p{Ll}+-\p{Ll}+$/u.test(name)
}

export interface CharacterData {
  profile: CharacterProfile
  equipment: Equipment
  specializations: Specializations
  /** « Prénom Nom » des membres de la guilde (autocomplétion). */
  guildMembers?: string[]
  /** Ids des quêtes en cours et terminées (absents si l'API ne les a pas donnés). */
  quests?: { active?: number[]; done?: number[] }
  /** Région de la recherche (ajoutée par fetchCharacter). */
  region?: Region
}

/** « Helga Tartine » : le nom tel qu'affiché en jeu. */
export function displayName(p: CharacterProfile): string {
  return p.name_search ?? `${p.name} ${p.surname}`
}

/** Un seul appel (une invocation Vercel) pour profil + équipement + spés. */
/** `locale` : locale Blizzard (fr_FR…) des noms renvoyés ; la logique n'utilise que des ids et des types. */
export async function fetchCharacter(region: Region, name: string, locale: string): Promise<CharacterData> {
  const res = await fetch(`/api/character?region=${region}&name=${encodeURIComponent(name)}&locale=${locale}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  }
  return { ...((await res.json()) as CharacterData), region }
}

/** Spé principale = arbre avec le plus de points dans le groupe actif. */
export function detectSpec(specs: Specializations): { name: string; label?: string; id: number; points: number } | null {
  const group = specs.specialization_groups.find((g) => g.is_active) ?? specs.specialization_groups[0]
  if (!group || group.specializations.length === 0) return null
  const best = group.specializations.reduce((a, b) => (b.spent_points > a.spent_points ? b : a))
  if (best.spent_points === 0) return null
  return { ...best.specialization, points: best.spent_points }
}

export function wowheadItemUrl(itemId: number, suffix?: number): string {
  return wowheadUrl('item', itemId) + (suffix ? `?bonus=${suffix}` : '')
}

export function wowheadQuestUrl(questId: number): string {
  return wowheadUrl('quest', questId)
}

export function wowheadNpcUrl(npcId: number): string {
  return wowheadUrl('npc', npcId)
}

/** Prix indicatifs à l'HV (voir api/prices.ts) : par id d'objet, [prix en cuivre, nombre de maisons]. */
export interface Prices {
  generated: string
  houses: number
  /** Clé : id de l'objet, ou « id:suffixe » pour un objet à stats aléatoires. */
  prices: Record<string, [copper: number, houses: number]>
}

export async function fetchPrices(region: Region, ruleset: number, faction: string): Promise<Prices> {
  const res = await fetch(`/api/prices?region=${region}&ruleset=${ruleset}&faction=${encodeURIComponent(faction)}`)
  if (!res.ok) throw new ApiError(res.status, `prix HV : HTTP ${res.status}`)
  return (await res.json()) as Prices
}
