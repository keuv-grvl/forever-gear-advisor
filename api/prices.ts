// GET /api/prices?region=eu&ruleset=1&faction=ALLIANCE
// Prix indicatifs à l'hôtel des ventes : pour chaque objet, la médiane des prix unitaires les plus bas relevés dans
// les maisons de vente de la faction. Objets à stats aléatoires : clé « objet:suffixe » (liste de bonus du client),
// l'app ne propose que ceux-là (voir src/lib/random.ts). Un ruleset Forever (PvP, Normal…) a plusieurs maisons par faction, sans enchère
// commune (groupes de royaumes, a priori) ; l'API ne dit pas laquelle sert un perso, d'où la médiane.
// Lourd (plusieurs dumps de ~13 Mo) : réponse mise en cache 6 h sur le CDN, et servie périmée pendant la mise à jour.

import { blizzardGet, HttpError, json, REGIONS } from './_lib/blizzard.js'

const FACTIONS: Record<string, string> = { ALLIANCE: 'Alliance', HORDE: 'Horde' }
const CACHE_SECONDS = 6 * 3600
const CONCURRENCY = 2 // dumps parsés en parallèle (mémoire)

interface Auction {
  item: { id: number; bonus_lists?: number[] }
  buyout?: number
  quantity?: number
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const region = params.get('region') ?? ''
  const ruleset = params.get('ruleset') ?? ''
  const faction = FACTIONS[params.get('faction') ?? '']
  if (!REGIONS.has(region)) return json(400, { error: 'region invalide (us, eu, kr, tw)' })
  if (!/^\d{1,3}$/.test(ruleset)) return json(400, { error: 'ruleset invalide' })
  if (!faction) return json(400, { error: 'faction invalide (ALLIANCE, HORDE)' })

  const get = (path: string) => blizzardGet(region, 'dynamic', path, 'en_US')
  try {
    const index = (await get(`/data/wow/ruleset/${ruleset}/auctions/`)) as { auctions?: { id: number; name: string }[] }
    const houses = (index.auctions ?? []).filter((h) => h.name.startsWith(faction))
    if (houses.length === 0) return json(404, { error: 'aucune maison de vente pour cette faction' }, 3600)

    // Prix unitaire le plus bas par objet (ou par objet et suffixe), dans chaque maison.
    const mins: Map<number | string, number>[] = []
    for (let i = 0; i < houses.length; i += CONCURRENCY) {
      const batch = await Promise.all(
        houses.slice(i, i + CONCURRENCY).map(async (h) => {
          const dump = (await get(`/data/wow/ruleset/${ruleset}/auctions/${h.id}`)) as { auctions?: Auction[] }
          const min = new Map<number | string, number>()
          for (const a of dump.auctions ?? []) {
            const bonus = a.item.bonus_lists ?? []
            if (!a.buyout || bonus.length > 1) continue
            const key = bonus.length ? `${a.item.id}:${bonus[0]}` : a.item.id
            const unit = Math.round(a.buyout / (a.quantity || 1))
            const prev = min.get(key)
            if (prev === undefined || unit < prev) min.set(key, unit)
          }
          return min
        }),
      )
      mins.push(...batch)
    }

    // Médiane (basse) des minimums, et nombre de maisons où l'objet est en vente.
    const all = new Map<number | string, number[]>()
    for (const min of mins) for (const [id, p] of min) all.set(id, [...(all.get(id) ?? []), p])
    const prices: Record<string, [copper: number, houses: number]> = {}
    for (const [id, list] of all) {
      list.sort((a, b) => a - b)
      prices[id] = [list[(list.length - 1) >> 1], list.length]
    }
    return json(200, { generated: new Date().toISOString(), houses: houses.length, prices }, CACHE_SECONDS)
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message }, err.status === 404 ? 3600 : 0)
    return json(502, { error: err instanceof Error ? err.message : String(err) })
  }
}
