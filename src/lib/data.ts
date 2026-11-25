// Données statiques (public/data/, servies par le CDN) : chargées une fois, à la première recherche.

import type { DbItem, Source } from './recommend'
import type { WeightsFile } from './scoring'

export interface GameData {
  items: DbItem[]
  generated: string
  sources: Record<number, Source[]>
  weights: WeightsFile
}

let pending: Promise<GameData> | null = null

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`)
  return (await res.json()) as T
}

export function loadGameData(): Promise<GameData> {
  pending ??= Promise.all([
    getJson<{ generated: string; items: DbItem[] }>('/data/items.json'),
    getJson<{ sources: Record<number, Source[]> }>('/data/sources.json'),
    getJson<WeightsFile>('/data/weights.json'),
  ])
    .then(([items, sources, weights]) => ({
      items: items.items,
      generated: items.generated,
      sources: sources.sources,
      weights,
    }))
    .catch((err) => {
      pending = null // permettre un nouvel essai
      throw err
    })
  return pending
}

/** Emplacements dans l'ordre de la fiche personnage (libellés : clés `slot.*` de src/i18n). */
export const SLOT_ORDER = [
  'HEAD',
  'NECK',
  'SHOULDER',
  'BACK',
  'CHEST',
  'SHIRT',
  'TABARD',
  'WRIST',
  'HANDS',
  'WAIST',
  'LEGS',
  'FEET',
  'FINGER_1',
  'FINGER_2',
  'TRINKET_1',
  'TRINKET_2',
  'MAIN_HAND',
  'OFF_HAND',
  'RANGED',
]
