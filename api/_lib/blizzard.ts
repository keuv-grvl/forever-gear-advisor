// Accès serveur à l'API Blizzard WoW Forever. Le préfixe `_` empêche Vercel d'en faire une fonction.
// Le client secret et le token ne sortent jamais d'ici.

export const REGIONS = new Set(['us', 'eu', 'kr', 'tw'])
export const LOCALES = new Set(['en_US', 'en_GB', 'fr_FR', 'de_DE', 'es_ES', 'it_IT', 'pt_BR', 'ru_RU', 'ko_KR', 'zh_TW'])

let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(forceRefresh = false): Promise<string> {
  // Le token (24 h) est gardé en mémoire tant que l'instance reste chaude.
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }
  const id = process.env.BLIZZARD_CLIENT_ID
  const secret = process.env.BLIZZARD_CLIENT_SECRET
  if (!id || !secret) throw new HttpError(500, 'BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET manquants')

  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new HttpError(502, `token Blizzard refusé (HTTP ${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return cachedToken.value
}

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function blizzardGet(
  region: string,
  namespace: 'profile' | 'static' | 'dynamic',
  path: string,
  locale: string,
): Promise<unknown> {
  const url = new URL(`https://${region}.api.blizzard.com${encodeURI(path)}`)
  url.searchParams.set('namespace', `${namespace}-forever-${region}`)
  url.searchParams.set('locale', locale)

  let res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken()}` } })
  if (res.status === 401) res = await fetch(url, { headers: { Authorization: `Bearer ${await getToken(true)}` } })
  if (res.status === 404) throw new HttpError(404, 'introuvable')
  if (!res.ok) throw new HttpError(502, `API Blizzard : HTTP ${res.status}`)
  return res.json()
}

// Champs inutiles pour l'app : on les retire pour alléger le transfert (quota Fast Origin Transfer).
const DROPPED_KEYS = new Set([
  '_links',
  'key',
  'display',
  'display_string',
  'display_strings',
  'color',
  'transmog',
  'durability',
  'sell_price',
  'media',
])

export function slim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(slim)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (!DROPPED_KEYS.has(k)) out[k] = slim(v)
    return out
  }
  return value
}

export function json(status: number, body: unknown, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // s-maxage : le CDN Vercel sert la réponse sans relancer la fonction (quota d'invocations).
      'Cache-Control':
        cacheSeconds > 0 ? `public, max-age=60, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : 'no-store',
    },
  })
}
