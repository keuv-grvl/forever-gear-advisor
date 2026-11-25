// Autocomplétion du nom, sans aucune requête : persos déjà consultés et membres de leur guilde,
// gardés dans le navigateur (localStorage). Le roster arrive avec la réponse de /api/character.

import { normalizeCharacterName, type Region } from './blizzard'

interface Store {
  /** Persos consultés, le plus récent d'abord. */
  recent: Partial<Record<Region, string[]>>
  /** Guildes des persos consultés, par région puis slug : nom affiché et membres (« Prénom Nom »). */
  guilds: Partial<Record<Region, Record<string, { name: string; members: string[] }>>>
}

const KEY = 'fga.suggest.v2'
const OLD_KEY = 'fga.suggest.v1' // guildes sans nom : { slug: membres }
const MAX_RECENT = 20
const MAX_GUILDS = 5

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null
    if (s && typeof s === 'object' && s.recent && s.guilds) return s
    // Ancienne version : on reprend l'historique, le nom de guilde est déduit du slug en attendant mieux.
    const old = JSON.parse(localStorage.getItem(OLD_KEY) ?? 'null') as { recent?: Store['recent']; guilds?: Partial<Record<Region, Record<string, string[]>>> } | null
    if (old?.recent && old.guilds) {
      const guilds: Store['guilds'] = {}
      for (const [region, bySlug] of Object.entries(old.guilds) as [Region, Record<string, string[]>][])
        guilds[region] = Object.fromEntries(
          Object.entries(bySlug).map(([slug, members]) => [slug, { name: slug.replace(/-/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase()), members }]),
        )
      return { recent: old.recent, guilds }
    }
  } catch {
    // stockage absent, bloqué ou illisible : on repart de zéro
  }
  return { recent: {}, guilds: {} }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
    localStorage.removeItem(OLD_KEY)
  } catch {
    // navigation privée, quota : l'autocomplétion est un confort, on s'en passe
  }
}

/** Retient un perso consulté avec succès, et les membres de sa guilde. */
export function remember(region: Region, name: string, guild?: { slug?: string; name?: string }, members?: string[]) {
  const s = read()
  const slug = normalizeCharacterName(name)
  s.recent[region] = [name, ...(s.recent[region] ?? []).filter((n) => normalizeCharacterName(n) !== slug)].slice(0, MAX_RECENT)
  if (guild?.slug && members?.length) {
    // Guilde réinsérée en dernier : les plus anciennes sont oubliées d'abord.
    const { [guild.slug]: _, ...others } = s.guilds[region] ?? {}
    const entry = { name: guild.name ?? guild.slug, members }
    s.guilds[region] = Object.fromEntries([...Object.entries(others), [guild.slug, entry]].slice(-MAX_GUILDS))
  }
  write(s)
}

/** Oublie tout l'historique (persos et guildes, toutes régions). */
export function forgetAll() {
  write({ recent: {}, guilds: {} })
}

// Comparaison sans casse ni accents, mots séparés par espace ou tiret.
const words = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)

/** Chaque mot tapé doit commencer un mot du nom : « helg », « tart » et « helga t » trouvent « Helga Tartine ». */
export function matches(name: string, query: string): boolean {
  const q = words(query)
  if (q.length === 0) return true
  const w = words(name)
  return q.every((part) => w.some((x) => x.startsWith(part)))
}

export interface SuggestionGroup {
  /** `recent` ou le nom de la guilde. */
  kind: 'recent' | 'guild'
  label: string
  names: string[]
}

/**
 * Suggestions pour une région : persos récents, puis une rubrique par guilde (la plus récente d'abord), sans doublon.
 * Sans texte tapé, seulement les récents (les guildes sont trop longues pour être listées en entier).
 */
export function suggestionGroups(region: Region, query: string, perGroup = 8): SuggestionGroup[] {
  const s = read()
  const seen = new Set<string>()
  const keep = (list: string[]) =>
    list
      .filter((n) => {
        const slug = normalizeCharacterName(n)
        if (seen.has(slug) || !matches(n, query)) return false
        seen.add(slug)
        return true
      })
      .slice(0, perGroup)
  const groups: SuggestionGroup[] = [{ kind: 'recent', label: '', names: keep(s.recent[region] ?? []) }]
  if (words(query).length > 0)
    for (const g of Object.values(s.guilds[region] ?? {}).reverse())
      groups.push({ kind: 'guild', label: g.name, names: keep([...g.members].sort((a, b) => a.localeCompare(b))) })
  return groups.filter((g) => g.names.length > 0)
}

// Préférences d'affichage (tri, filtres), par navigateur.
const PREFS_KEY = 'fga.prefs.v1'

export function readPrefs<T extends object>(defaults: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<T>
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

export function writePrefs(prefs: object) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // idem : simple confort
  }
}
