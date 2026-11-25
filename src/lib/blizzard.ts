// Client navigateur : passe toujours par /api (jamais d'appel direct à Blizzard).

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
  guild?: Named
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
    specializations: { specialization: Named; spent_points: number }[]
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
}

/** Un seul appel (une invocation Vercel) pour profil + équipement + spés. */
export async function fetchCharacter(region: Region, name: string): Promise<CharacterData> {
  const res = await fetch(`/api/character?region=${region}&name=${encodeURIComponent(name)}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as CharacterData
}

/** Spé principale = arbre avec le plus de points dans le groupe actif. */
export function detectSpec(specs: Specializations): { name: string; id: number; points: number } | null {
  const group = specs.specialization_groups.find((g) => g.is_active) ?? specs.specialization_groups[0]
  if (!group || group.specializations.length === 0) return null
  const best = group.specializations.reduce((a, b) => (b.spent_points > a.spent_points ? b : a))
  if (best.spent_points === 0) return null
  return { ...best.specialization, points: best.spent_points }
}

export function wowheadItemUrl(itemId: number): string {
  return `https://www.wowhead.com/forever/item=${itemId}`
}

export function wowheadQuestUrl(questId: number): string {
  return `https://www.wowhead.com/forever/quest=${questId}`
}
