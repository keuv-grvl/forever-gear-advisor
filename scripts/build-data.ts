// Génère public/data/items.json et public/data/sources.json. Données WoW Forever uniquement.
// Usage : npm run data:items   (lit .env.blizzard.local)
//
// - Objets : API Blizzard, namespace static-forever-eu (recherche par classe d'objet puis fiche de chaque objet).
//   L'API n'a qu'une partie des objets Forever (beaucoup d'objets de quête et de donjon manquent) : on complète
//   avec l'équipement réellement porté par les persos listés dans scripts/seeds.local.json (non versionné).
// - Craft : API Blizzard (métiers → paliers → recettes).
// - Quêtes : forever-db de Polestar (GPL-3.0), release figée ci-dessous.
// - Vendeurs : base forever-db de fatedfr (GPL-3.0, release « latest »), PNJ attestés par une source Forever.
// - Quêtes propres à Forever absentes de Polestar : même base, seulement les quêtes qu'aucune base Classic ne connaît.
// - Pas de drops : leurs données mêlent des bases Classic (décision : Forever uniquement).
//
// Les réponses de l'API sont gardées dans .cache/blizzard/ : une relance ne refait que les appels manquants
// ou plus vieux que CACHE_MAX_AGE_DAYS. En fin de génération réussie, tout fichier non utilisé est supprimé :
// le cache ne contient que ce que sert la dernière génération, il ne grossit pas indéfiniment.

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'

const REGION = 'eu'
const LOCALE = 'en_US'
const CACHE = '.cache/blizzard'
const CACHE_MAX_AGE_DAYS = 7 // au-delà, la réponse est redemandée (les patchs Forever modifient des objets)
const CONCURRENCY = 16

const usedCacheFiles = new Set<string>()

// Base de fatedfr : la release « latest » est refaite deux fois par jour ; on la retélécharge après CACHE_MAX_AGE_DAYS.
const FATEDFR_DB_URL = 'https://github.com/foreverfraddons/forever-db/releases/download/latest/forever.json.gz'
// Bit k de `src` = k-ième source passée à tools/merge.py, dans l'ordre du workflow de fatedfr
// (.github/workflows/build.yml) et PAS dans l'ordre de meta.sourceList. Vérifié au chargement.
const FATEDFR_SRC_BITS = ['client', 'questie', 'att', 'vmangos', 'cmangos', 'pfquest', 'legacy', 'spf', 'terrain']
const bitMask = (names: string[]) => names.reduce((m, n) => m | (1 << FATEDFR_SRC_BITS.indexOf(n)), 0)
const FATEDFR_FOREVER = bitMask(['client', 'questie', 'att', 'legacy', 'spf'])
const FATEDFR_CLASSIC = bitMask(['vmangos', 'cmangos', 'pfquest'])
const FATEDFR_ATT = bitMask(['att'])

const FOREVER_DB = {
  version: '2026.11.2',
  url: 'https://github.com/fitzforge/polestar/releases/download/data-v2026.11.2/forever-db-2026.11.2.zip',
  sha256: '43157067315537a8b95e5c517e30a1b6d55e117022f89094f039e9e6eb6438ad',
}

// ---------- API Blizzard ----------

let token = ''
async function getToken(): Promise<string> {
  const id = process.env.BLIZZARD_CLIENT_ID
  const secret = process.env.BLIZZARD_CLIENT_SECRET
  if (!id || !secret) throw new Error('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET absents : remplir .env.blizzard.local')
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`token refusé (HTTP ${res.status})`)
  return ((await res.json()) as { access_token: string }).access_token
}

let apiCalls = 0
/** GET sur l'API Forever, avec cache disque. Renvoie null sur 404. */
async function api<T>(namespace: 'static' | 'profile', path: string, query = ''): Promise<T | null> {
  const url = `https://${REGION}.api.blizzard.com${encodeURI(path)}?namespace=${namespace}-forever-${REGION}&locale=${LOCALE}${query ? '&' + query : ''}`
  const name = `${createHash('sha1').update(url).digest('hex')}.json`
  const file = `${CACHE}/${name}`
  usedCacheFiles.add(name)
  if (existsSync(file) && Date.now() - (await stat(file)).mtimeMs < CACHE_MAX_AGE_DAYS * 86_400_000) {
    return JSON.parse(await readFile(file, 'utf8')) as T | null
  }

  for (let attempt = 0; ; attempt++) {
    if (!token) token = await getToken()
    apiCalls++
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 401 && attempt < 2) {
      token = ''
      continue
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt))
      continue
    }
    if (res.status === 404) {
      await writeFile(file, 'null')
      return null
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`)
    const body = await res.text()
    await writeFile(file, body)
    return JSON.parse(body) as T
  }
}

/** Applique fn à chaque élément avec au plus CONCURRENCY appels simultanés. */
async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>, label: string): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
        if (++done % 500 === 0) console.log(`  ${label} : ${done}/${items.length}`)
      }
    }),
  )
  return out
}

// ---------- Types API (partiels) ----------

interface Ref {
  id: number
  name: string
}
interface Typed {
  type: string
  name: string
}
interface ApiItemPreview {
  item: { id: number }
  name: string
  quality: Typed
  item_class: Ref
  item_subclass: Ref
  inventory_type: Typed
  binding?: Typed
  unique_equipped?: string
  armor?: { value: number }
  weapon?: { damage: { min_value: number; max_value: number }; attack_speed: { value: number }; dps: { value: number } }
  stats?: { type?: Typed; value: number; is_negated?: boolean }[]
  spells?: { spell: Ref; description: string }[]
  requirements?: {
    level?: { value: number }
    playable_classes?: { links: Ref[] }
    faction?: { value: Typed }
    reputation?: { faction: Ref; min_reputation_level: number }
  }
  level?: { value: number }
  bonus_list?: number[]
}
interface ApiItem {
  id: number
  name: string
  level: number
  required_level: number
  preview_item: ApiItemPreview
}
interface SearchResult {
  pageCount: number
  results: { data: { id: number; name: Record<string, string>; is_equippable: boolean; inventory_type: { type: string } } }[]
}

// ---------- Format de sortie ----------

/** Objet tel que livré à l'app (clés courtes : le fichier est téléchargé par chaque visiteur). */
export interface OutItem {
  id: number
  n: string // nom
  q: string // qualité (UNCOMMON, RARE…)
  il?: number // niveau d'objet
  rl?: number // niveau requis
  al?: number // niveau d'accès : rl, sinon niveau min. de la quête qui le donne, sinon estimé (niveau d'objet − 5)
  ale?: 1 // al estimé depuis le niveau d'objet
  slot: string // inventory_type (HEAD, WEAPON, TWOHWEAPON…)
  cls: number // item_class (2 arme, 4 armure)
  sub: number // item_subclass
  subn: string // nom du sous-type (Leather, Sword…)
  a?: number // armure
  s?: Record<string, number> // stats (type Blizzard → valeur)
  w?: [min: number, max: number, speedMs: number, dps: number]
  sp?: string[] // effets (Équipé/Utiliser)
  pc?: number[] // classes autorisées (absent = toutes)
  fac?: string // faction requise
  u?: 1 // unique
  bop?: 1 // lié quand ramassé
  rep?: [faction: string, standing: number] // réputation requise (0 Détesté … 5 Honoré … 7 Exalté)
  src: 'api' | 'seen' // fiche API ou objet observé sur un perso
}

const EXCLUDED_SLOTS = new Set(['NON_EQUIP', 'BODY', 'TABARD', 'BAG', 'AMMO', 'QUIVER'])
const JUNK_NAME = /^\[PH\]|^Monster - |Deprecated|\bTEST\b|\bTesting\b|\bQA ?Test|^Bland |\(old\)|\bDEBUG\b|\bDNT\b/i

function toOutItem(p: ApiItemPreview, extra: { il?: number; rl?: number; src: OutItem['src'] }): OutItem {
  const stats: Record<string, number> = {}
  for (const s of p.stats ?? []) {
    // « +X à toutes les résistances » arrive sans type : non pondéré, on l'ignore.
    if (s.is_negated || !s.type) continue
    const key = s.type.type.replace(/[^A-Z0-9_]/g, '') // l'API laisse parfois une virgule finale
    stats[key] = (stats[key] ?? 0) + s.value
  }
  const out: OutItem = {
    id: p.item.id,
    n: p.name,
    q: p.quality.type,
    slot: p.inventory_type.type,
    cls: p.item_class.id,
    sub: p.item_subclass.id,
    subn: p.item_subclass.name,
    src: extra.src,
  }
  if (extra.il) out.il = extra.il
  if (extra.rl) out.rl = extra.rl
  if (p.armor?.value) out.a = p.armor.value
  if (Object.keys(stats).length) out.s = stats
  if (p.weapon) {
    out.w = [p.weapon.damage.min_value, p.weapon.damage.max_value, p.weapon.attack_speed.value, Math.round(p.weapon.dps.value * 100) / 100]
  }
  if (p.spells?.length) out.sp = p.spells.map((s) => s.description).filter(Boolean)
  if (p.requirements?.playable_classes) out.pc = p.requirements.playable_classes.links.map((c) => c.id)
  if (p.requirements?.faction) out.fac = p.requirements.faction.value.type
  if (p.unique_equipped) out.u = 1
  if (p.binding?.type === 'ON_ACQUIRE') out.bop = 1
  const r = p.requirements?.reputation
  if (r) out.rep = [r.faction.name, r.min_reputation_level]
  return out
}

// ---------- 1. Objets de l'API ----------

async function listEquippableIds(): Promise<number[]> {
  const ids: number[] = []
  for (const itemClass of [2, 4]) {
    // La recherche plafonne à 10 pages : on repart du dernier id vu.
    let from = 0
    for (;;) {
      let last = -1
      for (let page = 1; page <= 10; page++) {
        const r = await api<SearchResult>(
          'static',
          '/data/wow/search/item',
          `item_class.id=${itemClass}&orderby=id&_pageSize=100&_page=${page}&id=[${from},]`,
        )
        if (!r || r.results.length === 0) break
        for (const { data } of r.results) {
          last = data.id
          const name = data.name[LOCALE] ?? ''
          if (data.is_equippable && !EXCLUDED_SLOTS.has(data.inventory_type.type) && !JUNK_NAME.test(name)) ids.push(data.id)
        }
        if (page >= r.pageCount) break
      }
      if (last < 0 || last < from) break
      from = last + 1
    }
  }
  return [...new Set(ids)].sort((a, b) => a - b)
}

// ---------- 2. Objets observés sur des persos ----------

interface Seeds {
  characters?: string[]
  guilds?: string[]
}

async function harvestEquipment(known: Set<number>): Promise<OutItem[]> {
  const seedFile = 'scripts/seeds.local.json'
  if (!existsSync(seedFile)) {
    console.log(`  (pas de ${seedFile} : aucun objet observé ajouté)`)
    return []
  }
  const seeds = JSON.parse(await readFile(seedFile, 'utf8')) as Seeds
  const names = new Set(seeds.characters ?? [])
  for (const guild of seeds.guilds ?? []) {
    const roster = await api<{ members: { character: { name: string; surname?: string; slug?: string } }[] }>(
      'profile',
      `/data/wow/guild/${guild}/roster`,
    )
    for (const m of roster?.members ?? []) {
      const c = m.character
      const slug = c.slug ?? (c.surname ? `${c.name}-${c.surname}`.toLowerCase() : null)
      if (slug) names.add(slug)
    }
  }
  console.log(`  ${names.size} persos à lire`)

  const seen = new Map<number, OutItem>()
  await pool(
    [...names],
    async (name) => {
      const eq = await api<{ equipped_items: ApiItemPreview[] }>('profile', `/profile/wow/character/${name}/equipment`)
      for (const it of eq?.equipped_items ?? []) {
        // Objets à suffixe aléatoire (« of the Whale ») : stats propres à l'exemplaire, on ne les généralise pas.
        if (known.has(it.item.id) || seen.has(it.item.id) || it.bonus_list?.length) continue
        if (EXCLUDED_SLOTS.has(it.inventory_type.type)) continue
        seen.set(it.item.id, toOutItem(it, { il: it.level?.value, rl: it.requirements?.level?.value, src: 'seen' }))
      }
    },
    'persos',
  )
  return [...seen.values()]
}

// ---------- 3. Craft ----------

interface CraftSource {
  t: 'craft'
  prof: string
  recipe: string
  reagents: [id: number, name: string, qty: number][]
  qty?: number
}

async function buildCrafts(itemIds: Set<number>): Promise<Map<number, CraftSource[]>> {
  const index = await api<{ professions: Ref[] }>('static', '/data/wow/profession/index')
  const recipes: { prof: string; id: number }[] = []
  for (const prof of index?.professions ?? []) {
    if (JUNK_NAME.test(prof.name)) continue
    const p = await api<{ skill_tiers?: Ref[] }>('static', `/data/wow/profession/${prof.id}`)
    for (const tier of p?.skill_tiers ?? []) {
      const t = await api<{ categories?: { recipes: Ref[] }[] }>('static', `/data/wow/profession/${prof.id}/skill-tier/${tier.id}`)
      for (const c of t?.categories ?? []) for (const r of c.recipes) recipes.push({ prof: prof.name, id: r.id })
    }
  }
  console.log(`  ${recipes.length} recettes`)

  const crafts = new Map<number, CraftSource[]>()
  await pool(
    recipes,
    async ({ prof, id }) => {
      const r = await api<{
        name: string
        crafted_item?: Ref
        alliance_crafted_item?: Ref
        horde_crafted_item?: Ref
        reagents?: { reagent: Ref; quantity: number }[]
        crafted_quantity?: { value?: number }
      }>('static', `/data/wow/recipe/${id}`)
      const item = r?.crafted_item ?? r?.alliance_crafted_item ?? r?.horde_crafted_item
      if (!r || !item || !itemIds.has(item.id)) return
      const src: CraftSource = {
        t: 'craft',
        prof,
        recipe: r.name,
        reagents: (r.reagents ?? []).map((x) => [x.reagent.id, x.reagent.name, x.quantity]),
      }
      if (r.crafted_quantity?.value && r.crafted_quantity.value !== 1) src.qty = r.crafted_quantity.value
      crafts.set(item.id, [...(crafts.get(item.id) ?? []), src])
    },
    'recettes',
  )
  return crafts
}

// ---------- 4. Quêtes (forever-db de Polestar) ----------

interface QuestSource {
  t: 'quest'
  id: number
  title?: string
  lvl?: number
  min?: number
  side?: number // 0 les deux, 1 Alliance, 2 Horde
  cls?: number // classes autorisées, masque (bit id-1) ; absent = toutes
  choice?: 1 // objet au choix parmi plusieurs
}

async function readJsonl<T>(file: string): Promise<T[]> {
  return (await readFile(file, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T)
}

interface QuestInfo {
  id: number
  title?: string
  level?: number
  min_level?: number
  side?: number
  classes?: number
}

/** Source « quête » à partir de la table quest de forever-db (Polestar). */
function questSource(id: number, q: QuestInfo | undefined): QuestSource {
  const s: QuestSource = { t: 'quest', id }
  if (q?.title) s.title = q.title
  if (q?.level) s.lvl = q.level
  if (q?.min_level) s.min = q.min_level
  if (q?.side) s.side = q.side
  if (q?.classes) s.cls = q.classes
  return s
}

async function buildQuestSources(itemIds: Set<number>): Promise<{ sources: Map<number, QuestSource[]>; quests: Map<number, QuestInfo> }> {
  const dir = '.cache/forever-db'
  const zip = `${dir}/forever-db-${FOREVER_DB.version}.zip`
  await mkdir(dir, { recursive: true })
  if (!existsSync(zip)) {
    const res = await fetch(FOREVER_DB.url)
    if (!res.ok) throw new Error(`forever-db : HTTP ${res.status}`)
    await writeFile(zip, Buffer.from(await res.arrayBuffer()))
  }
  const sum = createHash('sha256').update(await readFile(zip)).digest('hex')
  if (sum !== FOREVER_DB.sha256) throw new Error(`forever-db : sha256 inattendu (${sum})`)
  const data = `${dir}/${FOREVER_DB.version}`
  if (!existsSync(`${data}/forever-db/data/item.jsonl`)) {
    await mkdir(data, { recursive: true })
    await promisify(execFile)('unzip', ['-q', '-o', zip, '-d', data])
  }
  // Anciennes versions de forever-db : supprimées.
  for (const entry of await readdir(dir)) {
    if (!entry.includes(FOREVER_DB.version)) await rm(`${dir}/${entry}`, { recursive: true, force: true })
  }
  const t = (name: string) => `${data}/forever-db/data/${name}.jsonl`

  const quests = new Map((await readJsonl<QuestInfo>(t('quest'))).map((q) => [q.id, q]))
  const out = new Map<number, QuestSource[]>()
  const add = (item: number, s: QuestSource) => out.set(item, [...(out.get(item) ?? []), s])

  for (const r of await readJsonl<{ quest: number; kind: string; id: number }>(t('quest_reward'))) {
    if ((r.kind !== 'item' && r.kind !== 'choice') || !itemIds.has(r.id)) continue
    const s = questSource(r.quest, quests.get(r.quest))
    if (r.kind === 'choice') s.choice = 1
    add(r.id, s)
  }
  return { sources: out, quests }
}

// ---------- 5. Vendeurs (forever-db de fatedfr) ----------

interface VendorSource {
  t: 'vendor'
  npc: number
  name: string
  sub?: string // « Warsong Supply Officer »
  side?: string // faction amicale : A, H ou AH
}

interface FatedfrDb {
  meta: { build: string; hash: string }
  vend: Record<string, number[]>
  rew: Record<string, number[]>
  npc: Record<string, [name: string, sub: string | null, ...rest: unknown[]]>
  quest: Record<string, [title: string, level: number | null, minLevel: number | null]>
  nfac: Record<string, string>
  src: { npc: Record<string, number>; item: Record<string, number>; quest: Record<string, number> }
}

async function loadFatedfr(): Promise<FatedfrDb> {
  const dir = '.cache/fatedfr'
  const file = `${dir}/forever.json.gz`
  await mkdir(dir, { recursive: true })
  if (!existsSync(file) || Date.now() - (await stat(file)).mtimeMs > CACHE_MAX_AGE_DAYS * 86_400_000) {
    const res = await fetch(FATEDFR_DB_URL)
    if (!res.ok) throw new Error(`forever-db (fatedfr) : HTTP ${res.status}`)
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
  }
  const db = JSON.parse(gunzipSync(await readFile(file)).toString('utf8')) as FatedfrDb
  // Contrôle de l'ordre des bits : un objet d'id Forever (>= 250000) n'existe dans aucune base Classic.
  const wrong = Object.entries(db.src.item).filter(([id, mask]) => Number(id) >= 250000 && mask & FATEDFR_CLASSIC).length
  if (wrong > 0) throw new Error(`forever-db (fatedfr) : ${wrong} objets Forever marqués Classic, l'ordre des bits de src a changé`)
  return db
}

function buildVendorSources(db: FatedfrDb, itemIds: Set<number>): Map<number, VendorSource[]> {
  const vendors = new Map<number, VendorSource[]>()
  for (const [itemId, npcIds] of Object.entries(db.vend)) {
    const id = Number(itemId)
    if (!itemIds.has(id)) continue
    const list: VendorSource[] = []
    for (const npc of npcIds) {
      // PNJ attesté par une source Forever (pas seulement par une base Classic).
      if (!((db.src.npc[npc] ?? 0) & FATEDFR_FOREVER)) continue
      const row = db.npc[npc]
      if (!row) continue
      const v: VendorSource = { t: 'vendor', npc, name: row[0] }
      if (row[1]) v.sub = row[1]
      if (db.nfac[npc]) v.side = db.nfac[npc]
      list.push(v)
    }
    // Quelques vendeurs suffisent ; ceux des deux factions d'abord.
    if (list.length) vendors.set(id, list.sort((a, b) => (b.side?.length ?? 0) - (a.side?.length ?? 0)).slice(0, 4))
  }
  return vendors
}

/**
 * Récompenses de quêtes absentes de la base de Polestar (ex. Khan Jehn 93128 → Abandoned Ferocity), seulement quand
 * le lien vient forcément d'une source Forever : la quête OU l'objet est inconnu de toutes les bases Classic
 * (une base Classic ne peut pas lier une quête à un objet qu'elle ne connaît pas, ex. Arathi Armbands 270080).
 */
function buildForeverQuestRewards(
  db: FatedfrDb,
  itemIds: Set<number>,
  known: Map<number, QuestSource[]>,
  quests: Map<number, QuestInfo>,
): Map<number, QuestSource[]> {
  const out = new Map<number, QuestSource[]>()
  for (const [itemId, questIds] of Object.entries(db.rew)) {
    const id = Number(itemId)
    if (!itemIds.has(id)) continue
    const itemMask = db.src.item[itemId] ?? 0
    const itemForeverOnly = !!(itemMask & FATEDFR_FOREVER) && !(itemMask & FATEDFR_CLASSIC)
    for (const q of questIds) {
      const mask = db.src.quest[q] ?? 0
      if (!(mask & FATEDFR_FOREVER)) continue
      if (mask & FATEDFR_CLASSIC && !itemForeverOnly) continue
      if (known.get(id)?.some((s) => s.id === q)) continue
      // Faction et classes : connues par la table quest de Polestar ; sinon titre et niveaux de fatedfr.
      const row = db.quest[q]
      const s = questSource(q, quests.get(q) ?? { id: q, title: row?.[0], level: row?.[1] ?? undefined, min_level: row?.[2] ?? undefined })
      out.set(id, [...(out.get(id) ?? []), s])
    }
  }
  return out
}

// ---------- Main ----------

await mkdir(CACHE, { recursive: true })
await mkdir('public/data', { recursive: true })

console.log('1. Objets équipables (API Forever)')
const ids = await listEquippableIds()
console.log(`  ${ids.length} objets équipables listés`)
const apiItems = (
  await pool(ids, async (id) => api<ApiItem>('static', `/data/wow/item/${id}`), 'fiches')
).filter((x): x is ApiItem => x !== null)
const items = new Map<number, OutItem>()
for (const it of apiItems) {
  items.set(it.id, toOutItem(it.preview_item, { il: it.level, rl: it.required_level, src: 'api' }))
}
console.log(`  ${items.size} fiches`)

console.log('2. Objets observés sur des persos')
for (const it of await harvestEquipment(new Set(items.keys()))) items.set(it.id, it)
console.log(`  total ${items.size} objets`)

const itemIds = new Set(items.keys())
console.log('3. Craft (API Forever)')
const crafts = await buildCrafts(itemIds)
console.log(`  ${crafts.size} objets fabriquables`)

console.log(`4. Quêtes (forever-db ${FOREVER_DB.version})`)
const { sources: fdb, quests: questTable } = await buildQuestSources(itemIds)
console.log(`  ${fdb.size} objets donnés par une quête`)

console.log('5. Vendeurs et quêtes Forever (forever-db de fatedfr)')
const fatedfr = await loadFatedfr()
const vendors = buildVendorSources(fatedfr, itemIds)
console.log(`  ${vendors.size} objets vendus (base du ${fatedfr.meta.build})`)
const foreverQuests = buildForeverQuestRewards(fatedfr, itemIds, fdb, questTable)
console.log(`  ${foreverQuests.size} objets donnés par une quête absente de Polestar (lien attesté Forever)`)

const sources: Record<number, (CraftSource | QuestSource | VendorSource)[]> = {}
for (const id of [...itemIds].sort((a, b) => a - b)) {
  const list = [...(crafts.get(id) ?? []), ...(fdb.get(id) ?? []), ...(foreverQuests.get(id) ?? []), ...(vendors.get(id) ?? [])]
  if (list.length) sources[id] = list
}

// Objets non disponibles. AllTheThings référence ce qu'on peut obtenir : les 69 objets propres à Forever portés par
// nos persos de test y sont tous. Un objet propre à Forever (aucune base Classic) qu'ATT ignore et sans aucune source
// connue est donc considéré comme non disponible (ex. Quick Strike Ring 288927, « not available to players » sur Wowhead).
// Les objets observés sur un perso sont gardés : quelqu'un les porte.
let unavailable = 0
for (const [id, it] of items) {
  const mask = fatedfr.src.item[id]
  if (it.src === 'seen' || mask === undefined || sources[id]) continue
  if (!(mask & FATEDFR_CLASSIC) && !(mask & FATEDFR_ATT)) {
    items.delete(id)
    unavailable++
  }
}
console.log(`  ${unavailable} objets propres à Forever probablement non disponibles écartés`)

// Niveau d'accès. Beaucoup d'objets Forever n'ont pas de niveau requis (30 %), dont des récompenses
// de quête de niveau 60 : sans ça, ils seraient proposés à n'importe quel niveau.
// Écart niveau d'objet → niveau requis constaté sur les objets Forever : 5 (Enduring Cap 33/28, Boulder Pads 41/36).
// Un niveau requis de 1 n'est pas fiable non plus : l'API le donne à des objets Forever de niveau 45 (Sulfuras 289295).
for (const it of items.values()) {
  if (it.rl && it.rl > 1) {
    it.al = it.rl
    continue
  }
  const questLevels = [...(fdb.get(it.id) ?? []), ...(foreverQuests.get(it.id) ?? [])]
    .map((q) => q.min ?? q.lvl)
    .filter((l): l is number => !!l)
  if (questLevels.length) it.al = Math.min(...questLevels)
  else if (it.il) {
    it.al = Math.max(1, it.il - 5)
    it.ale = 1
  }
}
for (const [id, it] of items) {
  if (JUNK_NAME.test(it.n)) items.delete(id)
  // Stats publiées sans rapport avec le niveau d'objet (Restored Wand : niveau 1, 44,7 DPS) :
  // objet probablement à niveau variable, on ne sait pas ce que le joueur obtiendra.
  else if ((it.il ?? 0) < 10 && (it.w?.[3] ?? 0) > 15) items.delete(id)
}

const generated = new Date().toISOString().slice(0, 10)
await writeFile(
  'public/data/items.json',
  JSON.stringify({
    generated,
    region: REGION,
    source: 'API Blizzard WoW Forever (static-forever + équipement observé), © Blizzard Entertainment',
    items: [...items.values()].sort((a, b) => a.id - b.id),
  }) + '\n',
)
await writeFile(
  'public/data/sources.json',
  JSON.stringify({
    generated,
    source: {
      craft: 'API Blizzard WoW Forever (recettes)',
      quest: `forever-db ${FOREVER_DB.version} (Polestar, GPL-3.0)`,
      vendor_and_forever_quests: `forever-db de fatedfr, build ${fatedfr.meta.build} (hash ${fatedfr.meta.hash}), GPL-3.0`,
    },
    sources,
  }) + '\n',
)
// Ménage du cache : seulement après une génération complète (un échec en cours de route ne vide rien).
let pruned = 0
for (const entry of await readdir(CACHE)) {
  if (!usedCacheFiles.has(entry)) {
    await rm(`${CACHE}/${entry}`, { force: true })
    pruned++
  }
}
console.log(`Terminé : ${items.size} objets, ${Object.keys(sources).length} avec source, ${apiCalls} appels API (hors cache).`)
console.log(`Cache : ${usedCacheFiles.size} réponses gardées, ${pruned} supprimées.`)
