// Objets à stats aléatoires (« Sorcerer Hat of the Elder ») : un objet de base + un suffixe tiré au butin.
//
// - Suffixes : tables du client WoW Forever (exports CSV de wago.tools). Un suffixe est une liste de bonus
//   (ItemBonus) : un nom (type 5 → ItemNameDescription) et des stats (type 2 : stat, part en 1/10000).
//   Valeur d'une stat = arrondi(points × part / 10000), où points = RandPropPoints[niveau d'objet][qualité][emplacement].
// - Objet de base : l'API Forever ne connaît pas ces objets (404) et le client n'a la fiche (ItemSparse) que d'une
//   petite partie ; le serveur envoie le reste au jeu. Fiche du client si elle existe, sinon qualité, niveaux et noms
//   de la base forever-db de fatedfr (décision de l'utilisateur : identiques au client sur les 102 objets comparables).
//   Type, sous-type et emplacement viennent toujours du client (table Item).
// - Armure : formule du client (ItemArmorQuality × ItemArmorTotal × ArmorLocation ; ItemArmorShield pour les
//   boucliers), identique à l'API sur ses 4 169 armures.
// - Armes écartées : leur vitesse n'est que dans ItemSparse, et les suffixes de lanceur de sorts changent leur DPS.

import { byId, clientBuild, clientTable as table, num, type Row } from './wago.ts'

/** Langue de l'app → locale du client (wago.tools). */
const CLIENT_LOCALES: Record<string, string> = {
  de: 'deDE',
  es: 'esES',
  fr: 'frFR',
  it: 'itIT',
  pt: 'ptBR',
  ru: 'ruRU',
  ko: 'koKR',
  cn: 'zhCN',
  tw: 'zhTW',
}

// Types de stat du client (ItemModType) → types de l'API Blizzard (ceux de items.json et des persos).
// Vérifié sur les objets à suffixe portés par des persos (voir checkObserved).
const STAT_TYPES: Record<number, string> = {
  3: 'AGILITY',
  4: 'STRENGTH',
  5: 'INTELLECT',
  6: 'SPIRIT',
  7: 'STAMINA',
  12: 'DEFENSE_SKILL_RATING',
  38: 'ATTACK_POWER',
  41: 'SPELL_HEALING_DONE',
  42: 'SPELL_DAMAGE_DONE',
  43: 'MANA_REGENERATION',
  45: 'SPELL_POWER',
  46: 'HEALTH_REGEN',
  51: 'FIRE_RESISTANCE',
  52: 'FROST_RESISTANCE',
  53: 'HOLY_RESISTANCE',
  54: 'SHADOW_RESISTANCE',
  55: 'NATURE_RESISTANCE',
  56: 'ARCANE_RESISTANCE',
  84: 'BONUS_STAT_HOLY_DAMAGE_DONE',
  85: 'BONUS_STAT_FIRE_DAMAGE_DONE',
  86: 'BONUS_STAT_NATURE_DAMAGE_DONE',
  87: 'BONUS_STAT_FROST_DAMAGE_DONE',
  88: 'BONUS_STAT_SHADOW_DAMAGE_DONE',
  89: 'BONUS_STAT_ARCANE_DAMAGE_DONE',
}

// Emplacement (InventoryType du client) → type de l'API et colonne de RandPropPoints.
const INVENTORY: Record<number, [type: string, randPropIndex: number]> = {
  1: ['HEAD', 0],
  2: ['NECK', 2],
  3: ['SHOULDER', 1],
  5: ['CHEST', 0],
  6: ['WAIST', 1],
  7: ['LEGS', 0],
  8: ['FEET', 1],
  9: ['WRIST', 2],
  10: ['HAND', 1],
  11: ['FINGER', 2],
  12: ['TRINKET', 1],
  14: ['SHIELD', 2],
  16: ['CLOAK', 2],
  20: ['ROBE', 0],
  23: ['HOLDABLE', 2],
}
const QUALITIES: Record<number, [type: string, randPropColumn: string]> = {
  2: ['UNCOMMON', 'Good'],
  3: ['RARE', 'Superior'],
  4: ['EPIC', 'Epic'],
}
const ARMOR_COLUMNS: Record<number, [total: string, location: string]> = {
  1: ['Cloth', 'Clothmodifier'],
  2: ['Leather', 'Leathermodifier'],
  3: ['Mail', 'Chainmodifier'],
  4: ['Plate', 'Platemodifier'],
}

/** Objet de base, tel que livré à l'app (public/data/random.json). */
export interface RandomBase {
  id: number
  n: string // nom de base, sans suffixe
  q: string
  il: number
  rl?: number
  al: number // niveau d'accès (comme items.json)
  ale?: 1
  slot: string
  cls: number
  sub: number
  subn: string
  a?: number
  rp: number // points de RandPropPoints pour ce niveau, cette qualité et cet emplacement
}
export interface Suffix {
  n: string // « of the Whale »
  s: [stat: string, share: number][] // part en 1/10000 des points
}
export interface RandomData {
  build: string
  items: RandomBase[]
  suffixes: Record<number, Suffix>
  /** Noms traduits, par langue de l'app : objets de base (fatedfr) et suffixes (client). */
  names: Record<string, { items: Record<number, string>; suffixes: Record<number, string> }>
}

/** Fiche minimale de la base de fatedfr : [nom, qualité, niveau requis, niveau d'objet, …]. */
export interface FatedfrItems {
  item: Record<string, [name: string, quality: number, reqLevel: number | null, ilvl: number | null, ...rest: unknown[]]>
  loc: Record<string, { item?: Record<string, string> }>
}

// ---------- Construction ----------

/**
 * @param subclassNames nom anglais des sous-types, clé `classe:sous-classe` (relevé dans les fiches de l'API)
 * @param junk noms d'objets à écarter (tests, placeholders)
 */
export async function buildRandomItems(fatedfr: FatedfrItems, subclassNames: Map<string, string>, junk: RegExp): Promise<RandomData> {
  const build = await clientBuild()
  const [bonusRows, treeNodes, itemTrees, descs, randProp, itemRows, sparseRows, armorQuality, armorTotal, armorLocation, armorShield] =
    await Promise.all(
      [
        'ItemBonus',
        'ItemBonusTreeNode',
        'ItemXBonusTree',
        'ItemNameDescription',
        'RandPropPoints',
        'Item',
        'ItemSparse',
        'ItemArmorQuality',
        'ItemArmorTotal',
        'ArmorLocation',
        'ItemArmorShield',
      ].map((t) => table(build, t)),
    )
  const localizedDescs = Object.fromEntries(
    await Promise.all(Object.entries(CLIENT_LOCALES).map(async ([lang, loc]) => [lang, byId(await table(build, 'ItemNameDescription', loc))])),
  ) as Record<string, Map<number, Row>>

  // Suffixes : listes de bonus avec un nom et au moins une stat connue.
  const descById = byId(descs)
  const lists = new Map<number, Row[]>()
  for (const r of bonusRows) {
    const id = Number(r.ParentItemBonusListID)
    lists.set(id, [...(lists.get(id) ?? []), r])
  }
  const suffixes: Record<number, Suffix> = {}
  const suffixDesc = new Map<number, number>()
  const unknownStats = new Set<number>()
  for (const [id, rows] of lists) {
    const nameRow = rows.find((r) => r.Type === '5')
    if (!nameRow) continue
    const stats: Suffix['s'] = []
    for (const r of [...rows].sort((a, b) => num(a, 'OrderIndex') - num(b, 'OrderIndex'))) {
      if (r.Type !== '2') continue // 23 : effet (« of Eluding »), 54 : arme de lanceur de sorts…
      const type = STAT_TYPES[num(r, 'Value_0')]
      if (type) stats.push([type, num(r, 'Value_1')])
      else unknownStats.add(num(r, 'Value_0'))
    }
    const desc = descById.get(num(nameRow, 'Value_0'))
    if (!desc || stats.length === 0) continue
    suffixes[id] = { n: desc.Description_lang, s: stats }
    suffixDesc.set(id, num(nameRow, 'Value_0'))
  }
  if (unknownStats.size) console.log(`  types de stat inconnus ignorés : ${[...unknownStats].join(', ')}`)

  // Objets qui peuvent recevoir un suffixe : objet → arbre de bonus → listes.
  const treeLists = new Map<number, number[]>()
  for (const r of treeNodes) {
    const tree = Number(r.ParentItemBonusTreeID)
    treeLists.set(tree, [...(treeLists.get(tree) ?? []), num(r, 'ChildItemBonusListID')])
  }
  const randomIds = new Set<number>()
  for (const r of itemTrees) if ((treeLists.get(num(r, 'ItemBonusTreeID')) ?? []).some((l) => suffixes[l])) randomIds.add(num(r, 'ItemID'))

  const items = byId(itemRows)
  const sparse = byId(sparseRows)
  const randPropByLevel = byId(randProp)
  const quality = byId(armorQuality)
  const total = byId(armorTotal)
  const location = byId(armorLocation)
  const shield = byId(armorShield)

  const armorOf = (ilvl: number, q: number, sub: number, inv: number): number => {
    if (sub === 6) return Math.floor(num(shield.get(ilvl), `Quality_${q}`) + 0.5)
    const cols = ARMOR_COLUMNS[sub]
    if (!cols) return 0
    const loc = location.get(inv === 20 ? 5 : inv)
    return Math.floor(num(quality.get(ilvl), `Qualitymod_${q}`) * num(total.get(ilvl), cols[0]) * num(loc, cols[1]) + 0.5)
  }

  // Quelques noms de fatedfr portent déjà un suffixe (« Ranger Leggings of Power », relevé sur un exemplaire) : on
  // retire un suffixe connu en fin de nom (en tête en coréen et en chinois, voir src/i18n suffixedName).
  const stripSuffix = (name: string, suffixNames: Set<string>, lang = 'en') => {
    for (const sfx of suffixNames) {
      if ((lang === 'cn' || lang === 'tw') && name.startsWith(sfx) && name.length > sfx.length) return name.slice(sfx.length)
      if (lang === 'ko' && name.startsWith(`${sfx} `)) return name.slice(sfx.length + 1)
      if (name.endsWith(` ${sfx}`)) return name.slice(0, -sfx.length - 1)
    }
    return name
  }
  const enSuffixNames = new Set(Object.values(suffixes).map((x) => x.n))
  let stripped = 0

  const out: RandomBase[] = []
  const fromClient = { client: 0, fatedfr: 0 }
  const skipped = { weapon: 0, noData: 0, other: 0 }
  for (const id of [...randomIds].sort((a, b) => a - b)) {
    const it = items.get(id)
    if (!it) continue
    const cls = num(it, 'ClassID')
    const sub = num(it, 'SubclassID')
    const inv = num(it, 'InventoryType')
    if (cls === 2) {
      skipped.weapon++
      continue
    }
    const slot = INVENTORY[inv]
    if (cls !== 4 || !slot) {
      skipped.other++
      continue
    }
    // Fiche : client d'abord, sinon fatedfr (niveau d'objet manquant : niveau requis + 5, la règle des objets verts).
    const s = sparse.get(id)
    const f = fatedfr.item[id]
    let name: string, q: number, rl: number, il: number
    if (s) {
      ;[name, q, rl, il] = [s.Display_lang, num(s, 'OverallQualityID'), num(s, 'RequiredLevel'), num(s, 'ItemLevel')]
      fromClient.client++
    } else if (f && f[1] !== undefined && (f[3] || f[2])) {
      ;[name, q, rl] = [stripSuffix(f[0], enSuffixNames), f[1], f[2] ?? 0]
      if (name !== f[0]) stripped++
      il = f[3] ?? rl + 5
      fromClient.fatedfr++
    } else {
      skipped.noData++
      continue
    }
    const qual = QUALITIES[q]
    const points = qual && num(randPropByLevel.get(il), `${qual[1]}_${slot[1]}`)
    if (!qual || !points || junk.test(name)) {
      skipped.other++
      continue
    }
    const base: RandomBase = {
      id,
      n: name,
      q: qual[0],
      il,
      al: rl > 1 ? rl : Math.max(1, il - 5),
      slot: slot[0],
      cls,
      sub,
      subn: subclassNames.get(`${cls}:${sub}`) ?? '',
      rp: points,
    }
    if (rl > 1) base.rl = rl
    else base.ale = 1
    const armor = armorOf(il, q, sub, inv)
    if (armor) base.a = armor
    out.push(base)
  }
  console.log(
    `  build ${build} : ${Object.keys(suffixes).length} suffixes, ${out.length} objets de base ` +
      `(fiche du client ${fromClient.client}, de fatedfr ${fromClient.fatedfr}) ; écartés : ${skipped.weapon} armes, ` +
      `${skipped.noData} sans fiche, ${skipped.other} autres ; ${stripped} noms de fatedfr débarrassés d'un suffixe`,
  )

  // Noms traduits : objets de base (fatedfr, pas d'italien) et suffixes (client).
  const kept = new Set(out.map((b) => b.id))
  const names: RandomData['names'] = {}
  for (const [lang, loc] of Object.entries(CLIENT_LOCALES)) {
    const suffixNames: Record<number, string> = {}
    for (const [id, desc] of suffixDesc) {
      const n = localizedDescs[lang].get(desc)?.Description_lang
      if (n && n !== suffixes[id].n) suffixNames[id] = n
    }
    const localSuffixes = new Set(Object.values(suffixNames))
    const itemNames: Record<number, string> = {}
    for (const [id, n] of Object.entries(fatedfr.loc[loc]?.item ?? {}))
      if (kept.has(Number(id)) && n) itemNames[Number(id)] = stripSuffix(n, localSuffixes, lang)
    names[lang] = { items: itemNames, suffixes: suffixNames }
  }
  return { build, items: out, suffixes, names }
}

/** Stats d'un objet à suffixe (même calcul que l'app, src/lib/random.ts). */
export function suffixStats(points: number, suffix: Suffix): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const [type, share] of suffix.s) stats[type] = (stats[type] ?? 0) + Math.round((points * share) / 10000)
  return stats
}

/**
 * Contrôle sur les objets à suffixe portés par des persos (API Forever) : stats et armure calculées = réelles ?
 * Renvoie le nombre d'objets conformes et les écarts.
 */
export function checkObserved(
  data: RandomData,
  observed: { item: { id: number }; bonus_list?: number[]; stats?: { type?: { type: string }; value: number; is_negated?: boolean }[]; armor?: { value: number } }[],
): { checked: number; ok: number; diffs: string[] } {
  const bases = new Map(data.items.map((b) => [b.id, b]))
  const diffs: string[] = []
  let checked = 0
  for (const o of observed) {
    const base = bases.get(o.item.id)
    const suffix = data.suffixes[o.bonus_list?.[0] ?? 0]
    if (!base || !suffix || (o.bonus_list?.length ?? 0) !== 1) continue
    checked++
    const want: Record<string, number> = {}
    for (const s of o.stats ?? []) if (s.type && !s.is_negated) want[s.type.type] = (want[s.type.type] ?? 0) + s.value
    const got = suffixStats(base.rp, suffix)
    const same = (a: Record<string, number>, b: Record<string, number>) =>
      Object.keys({ ...a, ...b }).every((k) => (a[k] ?? 0) === (b[k] ?? 0))
    if (!same(got, want) || (o.armor?.value ?? 0) !== (base.a ?? 0))
      diffs.push(`${o.item.id} ${base.n} ${suffix.n} : calculé ${JSON.stringify(got)} armure ${base.a ?? 0}, réel ${JSON.stringify(want)} armure ${o.armor?.value ?? 0}`)
  }
  return { checked, ok: checked - diffs.length, diffs }
}
