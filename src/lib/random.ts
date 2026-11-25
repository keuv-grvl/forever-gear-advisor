// Objets à stats aléatoires (« … of the Whale ») en vente à l'HV : objet de base + suffixe, stats calculées.
// Données : public/data/random.json (voir scripts/random-items.ts). Seules les combinaisons vues à l'HV sont
// proposées : on ne peut pas viser un suffixe en farmant, mais on peut l'acheter.

import type { DbItem } from './recommend'

export interface RandomBase {
  id: number
  n: string
  q: string
  il: number
  rl?: number
  al: number
  ale?: 1
  slot: string
  cls: number
  sub: number
  subn: string
  a?: number
  /** Points de stats de l'objet (RandPropPoints) ; chaque stat du suffixe en prend une part. */
  rp: number
}

export interface Suffix {
  n: string
  /** [type de stat, part en 1/10000 des points] */
  s: [string, number][]
}

export interface RandomData {
  items: RandomBase[]
  suffixes: Record<number, Suffix>
}

/** Stats d'un objet de base avec ce suffixe (calcul du client, vérifié sur les objets portés). */
export function suffixStats(points: number, suffix: Suffix): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const [type, share] of suffix.s) stats[type] = (stats[type] ?? 0) + Math.round((points * share) / 10000)
  return stats
}

/** Clé de prix des objets à suffixe dans /api/prices : « objet:suffixe ». */
export const suffixKey = (id: number, suffix: number) => `${id}:${suffix}`

/** Objets à suffixe en vente (clés « objet:suffixe » des prix), prêts pour le moteur de recommandation. */
export function randomOffers(data: RandomData, priceKeys: Iterable<string>): DbItem[] {
  const bases = new Map(data.items.map((b) => [b.id, b]))
  const out: DbItem[] = []
  for (const key of priceKeys) {
    const [id, sfx] = key.split(':').map(Number)
    const base = bases.get(id)
    const suffix = data.suffixes[sfx]
    if (!base || !suffix) continue
    const { rp: _, n, ...rest } = base
    out.push({ ...rest, n: `${n} ${suffix.n}`, s: suffixStats(base.rp, suffix), sfx, src: 'api' })
  }
  return out
}
