// Proxy vers l'API Blizzard WoW Forever.
// Le client secret et le token restent côté serveur : le navigateur n'appelle que cette fonction.
// Usage : GET /api/blizzard?region=eu&path=/profile/wow/character/helga-tartine/equipment[&locale=fr_FR]

const REGIONS = new Set(['us', 'eu', 'kr', 'tw'])
const LOCALES = new Set(['en_US', 'en_GB', 'fr_FR', 'de_DE', 'es_ES', 'it_IT', 'pt_BR', 'ru_RU', 'ko_KR', 'zh_TW'])

// Seuls ces chemins sont relayés, pour ne pas offrir un proxy ouvert sur notre quota.
const ROUTES: { pattern: RegExp; namespace: 'profile' | 'static'; cacheSeconds: number }[] = [
  // Personnage : /profile/wow/character/{prenom-nom}[/sous-ressource[/...]]
  { pattern: /^\/profile\/wow\/character\/\p{Ll}+-\p{Ll}+(\/[a-z-]+){0,2}$/u, namespace: 'profile', cacheSeconds: 300 },
  // Objet et son icône
  { pattern: /^\/data\/wow\/(media\/)?item\/\d+$/, namespace: 'static', cacheSeconds: 86400 },
]

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const id = process.env.BLIZZARD_CLIENT_ID
  const secret = process.env.BLIZZARD_CLIENT_SECRET
  if (!id || !secret) throw new Error('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET manquants')

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`token Blizzard refusé (HTTP ${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

function json(status: number, body: unknown, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheSeconds > 0 ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60` : 'no-store',
    },
  })
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const region = params.get('region') ?? ''
  const path = params.get('path') ?? ''
  const locale = params.get('locale') ?? 'en_US'

  if (!REGIONS.has(region)) return json(400, { error: 'region invalide (us, eu, kr, tw)' })
  if (!LOCALES.has(locale)) return json(400, { error: 'locale invalide' })
  const route = ROUTES.find((r) => r.pattern.test(path))
  if (!route) return json(400, { error: 'chemin non autorisé' })

  const upstream = new URL(`https://${region}.api.blizzard.com${encodeURI(path)}`)
  upstream.searchParams.set('namespace', `${route.namespace}-forever-${region}`)
  upstream.searchParams.set('locale', locale)

  try {
    let res = await fetch(upstream, { headers: { Authorization: `Bearer ${await getToken()}` } })
    if (res.status === 401) {
      res = await fetch(upstream, { headers: { Authorization: `Bearer ${await getToken(true)}` } })
    }
    if (res.status === 404) return json(404, { error: 'introuvable' }, 60)
    if (!res.ok) return json(502, { error: `API Blizzard : HTTP ${res.status}` })
    return json(200, await res.json(), route.cacheSeconds)
  } catch (err) {
    return json(502, { error: err instanceof Error ? err.message : String(err) })
  }
}
