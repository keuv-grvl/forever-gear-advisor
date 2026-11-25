// GET /api/character?region=eu&name=helga-tartine[&locale=fr_FR]
// Renvoie profil, équipement et spés en une seule invocation (quota Vercel), réponses allégées et mises en cache CDN.

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
  try {
    const [profile, equipment, specializations] = await Promise.all(
      [base, `${base}/equipment`, `${base}/specializations`].map((p) => blizzardGet(region, 'profile', p, locale)),
    )
    return json(200, slim({ profile, equipment, specializations }), 300)
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message }, err.status === 404 ? 60 : 0)
    return json(502, { error: err instanceof Error ? err.message : String(err) })
  }
}
