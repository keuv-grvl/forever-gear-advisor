// Autocomplétion du nom, sans aucune requête : persos déjà consultés et membres de leur guilde,
// gardés dans le navigateur (localStorage). Le roster arrive avec la réponse de /api/character.

import { normalizeCharacterName, type Region } from './blizzard'

interface Store {
  /** Persos consultés, le plus récent d'abord. */
  recent: Partial<Record<Region, string[]>>
  /** Membres des guildes des persos consultés, par région puis guilde. */
  guilds: Partial<Record<Region, Record<string, string[]>>>
}

const KEY = 'fga.suggest.v1'
const MAX_RECENT = 20
const MAX_GUILDS = 5

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '') as Store
    if (s && typeof s === 'object' && s.recent && s.guilds) return s
  } catch {
    // stockage absent, bloqué ou illisible : on repart de zéro
  }
  return { recent: {}, guilds: {} }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // navigation privée, quota : l'autocomplétion est un confort, on s'en passe
  }
}

/** Retient un perso consulté avec succès, et les membres de sa guilde. */
export function remember(region: Region, name: string, guild?: string, members?: string[]) {
  const s = read()
  const slug = normalizeCharacterName(name)
  s.recent[region] = [name, ...(s.recent[region] ?? []).filter((n) => normalizeCharacterName(n) !== slug)].slice(0, MAX_RECENT)
  if (guild && members?.length) {
    // Guilde réinsérée en dernier : les plus anciennes sont oubliées d'abord.
    const { [guild]: _, ...others } = s.guilds[region] ?? {}
    s.guilds[region] = Object.fromEntries([...Object.entries(others), [guild, members]].slice(-MAX_GUILDS))
  }
  write(s)
}

/** Suggestions pour une région : persos récents d'abord, puis membres de guilde, sans doublon. */
export function suggestions(region: Region): string[] {
  const s = read()
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of [...(s.recent[region] ?? []), ...Object.values(s.guilds[region] ?? {}).flat().sort((a, b) => a.localeCompare(b))]) {
    const slug = normalizeCharacterName(name)
    if (seen.has(slug)) continue
    seen.add(slug)
    out.push(name)
  }
  return out
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
