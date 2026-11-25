// GET /api/character?region=eu&name=helga-tartine[&locale=fr_FR]
// Renvoie profil, équipement, spés, quêtes (en cours, terminées) et membres de la guilde (autocomplétion)
// en une seule invocation (quota Vercel), réponses allégées et mises en cache CDN.

import { blizzardGet, HttpError, json, LOCALES, REGIONS, slim } from './_lib/blizzard.js'

const NAME = /^\p{Ll}+-\p{Ll}+$/u

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const region = params.get('region') ?? ''
  const name = params.get('name') ?? ''
  const locale = params.get('locale') ?? 'en_US'

  if (!REGIONS.has(region)) return json(400, { error: 'region invalide (us, eu, kr, tw)' })
  if (!LOCALES.has(locale)) return json(400, { error: 'locale invalide' })
  if (!NAME.test(name)) return json(400, { error: 'nom invalide, format attendu : prenom-nom' })

  const base = `/profile/wow/character/${name}`
  const get = (path: string) => blizzardGet(region, 'profile', path, locale)
  try {
    const profileP = get(base)
    // Le roster dépend du profil (slug de guilde) ; son échec ne doit pas empêcher d'afficher le perso.
    const rosterP = profileP.then((p) => {
      const guild = (p as { guild?: { slug?: string } }).guild?.slug
      return guild ? get(`/data/wow/guild/${guild}/roster`).catch(() => null) : null
    })
    const [profile, equipment, specializations, roster, active, completed] = await Promise.all([
      profileP,
      get(`${base}/equipment`),
      get(`${base}/specializations`),
      rosterP,
      // Quêtes en cours et terminées : facultatives, comme le roster.
      get(`${base}/quests`).catch(() => null),
      get(`${base}/quests/completed`).catch(() => null),
    ])
    return json(
      200,
      {
        ...(slim({ profile, equipment, specializations }) as object),
        guildMembers: memberNames(roster),
        quests: { active: questIds(active, 'in_progress'), done: questIds(completed, 'quests') },
      },
      300,
    )
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message }, err.status === 404 ? 60 : 0)
    return json(502, { error: err instanceof Error ? err.message : String(err) })
  }
}

/** « Prénom Nom » des membres de la guilde, sans le reste du roster. */
function memberNames(roster: unknown): string[] | undefined {
  const members = (roster as { members?: { character?: { name?: string; surname?: string } }[] } | null)?.members
  return members?.flatMap(({ character: c }) => (c?.name && c.surname ? [`${c.name} ${c.surname}`] : []))
}

/** Ids des quêtes d'une liste du profil (`in_progress` ou `quests`), sans les noms ni les liens. */
function questIds(res: unknown, key: string): number[] | undefined {
  const list = (res as Record<string, { id?: number }[] | undefined> | null)?.[key]
  return list?.flatMap((q) => (typeof q.id === 'number' ? [q.id] : []))
}
