// Moteur de recommandation : pour chaque slot, les objets portables qui battent l'équipement actuel.

import type { EquippedItem } from './blizzard'
import { bestArmorType, canDualWield, canWear, SLOTS_FOR } from './rules'
import { scoreItem, type ScorableItem } from './scoring'

/** Objet de public/data/items.json (voir scripts/build-data.ts, clés courtes). */
export interface DbItem {
  id: number
  n: string
  q: string
  il?: number
  rl?: number
  al?: number
  ale?: 1
  slot: string
  cls: number
  sub: number
  subn: string
  a?: number
  s?: Record<string, number>
  w?: [number, number, number, number]
  sp?: string[]
  pc?: number[]
  fac?: string
  u?: 1
  bop?: 1
  /** Réputation requise : faction, rang (0 Détesté … 7 Exalté), faction côté Horde si elle diffère. */
  rep?: [string, number, string?]
  src: 'api' | 'seen'
  /** Suffixe aléatoire (liste de bonus du client), pour les objets « … of the Whale » en vente à l'HV. */
  sfx?: number
}

/** Identifiant d'un objet proposé : l'id, plus le suffixe pour un objet à stats aléatoires. */
export const itemKey = (it: { id: number; sfx?: number }) => (it.sfx ? `${it.id}:${it.sfx}` : String(it.id))

export type Source =
  | {
      t: 'craft'
      prof: string
      /** Id du métier (171 Alchimie…) et de la recette, comparés aux métiers du perso. */
      pid?: number
      recipe: string
      rid?: number
      reagents: [number, string, number][]
      qty?: number
    }
  | {
      t: 'quest'
      id: number
      title?: string
      lvl?: number
      min?: number
      side?: number
      cls?: number
      choice?: 1
      inst?: 'dungeon' | 'raid'
      rpt?: 1
    }
  | { t: 'vendor'; npc: number; name: string; sub?: string; side?: string }

/** Côté du perso : A (Alliance) ou H (Horde). */
export function sideOf(faction: string): 'A' | 'H' {
  return faction === 'HORDE' ? 'H' : 'A'
}

/** Métiers du perso (ids) et recettes qu'il connaît (ids), d'après /professions. */
export interface Crafter {
  professions: ReadonlySet<number>
  recipes: ReadonlySet<number>
}

/** Ce qui rend une source accessible ou non au perso. */
export interface SourceContext {
  side: 'A' | 'H'
  classId: number
  /** Quêtes terminées. */
  done?: ReadonlySet<number>
  /** Métiers du perso ; absent si l'API ne les a pas donnés (aucun craft écarté). */
  crafter?: Crafter
}

/**
 * Sources accessibles au perso : quêtes d'une autre faction ou classe, quêtes déjà faites (sauf répétables),
 * vendeurs de l'autre faction et crafts liés quand ramassés d'un métier qu'il n'a pas écartés. Un craft lié quand
 * équipé reste accessible : un autre joueur peut le fabriquer.
 */
export function sourcesFor(sources: Source[] | undefined, item: { bop?: 1 }, ctx: SourceContext): Source[] {
  const questSide = ctx.side === 'A' ? 1 : 2
  const classBit = 1 << (ctx.classId - 1)
  return (sources ?? []).filter((s) => {
    if (s.t === 'quest')
      return (!s.side || s.side === questSide) && (!s.cls || (s.cls & classBit) !== 0) && (s.rpt === 1 || !ctx.done?.has(s.id))
    if (s.t === 'vendor') return !s.side || s.side.includes(ctx.side)
    return !item.bop || !ctx.crafter || s.pid === undefined || ctx.crafter.professions.has(s.pid)
  })
}

/**
 * Origine d'un objet, pour le filtre : `rep` = demande une réputation ; sans source connue, `boe` = lié quand
 * équipé (du butin, en général, qu'on peut acheter à l'HV), `unknown` = lié quand ramassé.
 */
export type Origin = 'quest' | 'dungeon' | 'craft' | 'vendor' | 'boe' | 'rep' | 'unknown'
export const ORIGINS: Origin[] = ['quest', 'dungeon', 'craft', 'vendor', 'boe', 'rep', 'unknown']

/**
 * L'objet passe-t-il le filtre d'origine ? Il faut qu'au moins une de ses sources accessibles soit cochée ;
 * un objet qui demande une réputation est écarté si `rep` est décoché, quelle que soit sa source.
 */
export function originAllowed(item: DbItem, sources: Source[], allowed: ReadonlySet<Origin>): boolean {
  if (item.rep && !allowed.has('rep')) return false
  if (sources.length > 0) return sources.some((s) => allowed.has(s.t === 'quest' ? (s.inst ? 'dungeon' : 'quest') : s.t))
  if (item.rep) return true
  return allowed.has(item.bop ? 'unknown' : 'boe')
}

export interface Candidate {
  item: DbItem
  score: number
  gain: number
  /** Arme proposée avec une main gauche (quand on remplace une arme à deux mains). */
  with?: DbItem
}

export interface SlotAdvice {
  slot: string
  equipped?: { name: string; id: number; sfx?: number; score: number }
  candidates: Candidate[]
}

export interface RecommendOptions {
  classId: number
  level: number
  faction: string // ALLIANCE / HORDE
  weights: Record<string, number>
  /** Niveaux d'avance : propose aussi des objets jusqu'à niveau + anticipate. */
  anticipate: number
  perSlot: number
  /** Ne proposer que le type d'armure le plus lourd de la classe (mailles pour un paladin 36…). */
  mainArmorOnly: boolean
  sources: Record<number, Source[]>
  /** Origines acceptées (toutes si absent). */
  origins?: ReadonlySet<Origin>
  /** Quêtes déjà faites par le perso : leurs récompenses ne sont plus accessibles (sauf quêtes répétables). */
  doneQuests?: ReadonlySet<number>
  /** Métiers du perso : un craft lié quand ramassé d'un autre métier n'est pas accessible. */
  crafter?: Crafter
}

// Slots d'armure où le type (tissu, cuir, mailles, plaques) compte ; le dos est toujours en tissu.
const TYPED_ARMOR_SLOTS = new Set(['HEAD', 'SHOULDER', 'CHEST', 'ROBE', 'WRIST', 'HAND', 'WAIST', 'LEGS', 'FEET'])

export function fromEquipped(it: EquippedItem): ScorableItem {
  const stats: Record<string, number> = {}
  for (const s of it.stats ?? []) {
    if (s.is_negated || !s.type) continue
    const k = s.type.type.replace(/[^A-Z0-9_]/g, '')
    stats[k] = (stats[k] ?? 0) + s.value
  }
  return { slot: it.inventory_type?.type ?? '', stats, armor: it.armor?.value ?? 0, dps: it.weapon?.dps.value ?? 0 }
}

export function fromDb(it: DbItem): ScorableItem {
  return { slot: it.slot, stats: it.s ?? {}, armor: it.a ?? 0, dps: it.w?.[3] ?? 0 }
}

const ONE_HAND_MAIN = new Set(['WEAPON', 'WEAPONMAINHAND'])
const OFF_HAND = new Set(['SHIELD', 'HOLDABLE'])

export function recommend(equipped: EquippedItem[], db: DbItem[], o: RecommendOptions): SlotAdvice[] {
  const maxLevel = o.level + o.anticipate
  const dualWield = canDualWield(o.classId, maxLevel)
  const bySlot = new Map(equipped.map((e) => [e.slot.type, e]))
  // Objet déjà porté : même id, et même suffixe pour un objet à stats aléatoires.
  const equippedKeys = new Set(equipped.map((e) => itemKey({ id: e.item.id, sfx: e.bonus_list?.length === 1 ? e.bonus_list[0] : undefined })))

  const score = (it: ScorableItem, offHand = false) => scoreItem(it, o.weights, offHand)
  const eqScore = (slot: string, offHand = false) => {
    const e = bySlot.get(slot)
    return e ? score(fromEquipped(e), offHand) : 0
  }

  // Candidats portables par ce perso, au plus tard à maxLevel.
  const mainArmor = bestArmorType(o.classId, maxLevel)
  const side = sideOf(o.faction)
  // Objet dont toutes les sources connues sont réservées à l'autre faction (ex. Advisor's Gnarled Staff,
  // vendu seulement par l'intendant Chanteguerre), à une autre classe ou des quêtes déjà faites : inaccessible.
  // Sans source connue, on le garde.
  const reachable = (it: DbItem) => {
    const all = o.sources[it.id]
    const mine = sourcesFor(all, it, { side, classId: o.classId, done: o.doneQuests, crafter: o.crafter })
    return (!all?.length || mine.length > 0) && (!o.origins || originAllowed(it, mine, o.origins))
  }
  const usable = db.filter(
    (it) =>
      reachable(it) &&
      (it.al ?? it.rl ?? 0) <= maxLevel &&
      (!o.mainArmorOnly || it.cls !== 4 || !TYPED_ARMOR_SLOTS.has(it.slot) || it.sub === mainArmor) &&
      (!it.fac || it.fac === o.faction) &&
      !equippedKeys.has(itemKey(it)) &&
      SLOTS_FOR[it.slot] &&
      canWear(o.classId, maxLevel, it),
  )
  const scored = usable.map((item) => ({ item, s: score(fromDb(item)) }))
  const top = (list: Candidate[]) =>
    list
      .filter((c) => c.gain > 0)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, o.perSlot)
  const advice = (slot: string, candidates: Candidate[], offHand = false): SlotAdvice => {
    const e = bySlot.get(slot)
    return {
      slot,
      equipped: e ? { name: e.name, id: e.item.id, sfx: e.bonus_list?.[0], score: eqScore(slot, offHand) } : undefined,
      candidates: top(candidates),
    }
  }

  const out: SlotAdvice[] = []

  // Slots simples.
  for (const slot of ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'WRIST', 'HANDS', 'WAIST', 'LEGS', 'FEET']) {
    const current = eqScore(slot)
    const list = scored.filter((c) => SLOTS_FOR[c.item.slot].includes(slot)).map((c) => ({ item: c.item, score: c.s, gain: c.s - current }))
    out.push(advice(slot, list))
  }

  // Paires (anneaux, bijoux) : une ligne par emplacement. Le plus faible (un emplacement vide d'abord) reçoit
  // les meilleurs candidats ; l'autre, les suivants, sans le premier choix du faible s'il est unique.
  for (const [a, b] of [
    ['FINGER_1', 'FINGER_2'],
    ['TRINKET_1', 'TRINKET_2'],
  ]) {
    const aFirst = bySlot.has(a) === bySlot.has(b) ? eqScore(a) <= eqScore(b) : !bySlot.has(a)
    const [weak, strong] = aFirst ? [a, b] : [b, a]
    const fits = scored.filter((c) => SLOTS_FOR[c.item.slot].includes(a))
    const vs = (slot: string, list: typeof fits) => list.map((c) => ({ item: c.item, score: c.s, gain: c.s - eqScore(slot) }))
    const weakAdvice = advice(weak, vs(weak, fits))
    const taken = weakAdvice.candidates[0]?.item
    out.push(weakAdvice, advice(strong, vs(strong, fits.filter((c) => !(taken?.u && c.item.id === taken.id)))))
  }

  // Armes : on compare des ensembles (2M seule, ou main droite + main gauche).
  const mh = bySlot.get('MAIN_HAND')
  const twoHanded = mh?.inventory_type?.type === 'TWOHWEAPON'
  const currentSet = eqScore('MAIN_HAND') + eqScore('OFF_HAND', true)
  // Arme en main gauche (« Left-Handed Blades », arme à une main) : seulement si la classe manie deux armes.
  // Bouclier et objet tenu en main gauche : toutes les classes qui peuvent les porter (canWear).
  const offHandOk = (it: DbItem) => OFF_HAND.has(it.slot) || (dualWield && (it.slot === 'WEAPON' || it.slot === 'WEAPONOFFHAND'))
  const offHands = usable
    .filter(offHandOk)
    .map((item) => ({ item, s: score(fromDb(item), item.cls === 2) }))
    .sort((x, y) => y.s - x.s)
  const currentOff = eqScore('OFF_HAND', true)

  const mainList: Candidate[] = []
  for (const c of scored) {
    if (c.item.slot === 'TWOHWEAPON') mainList.push({ item: c.item, score: c.s, gain: c.s - currentSet })
    else if (ONE_HAND_MAIN.has(c.item.slot)) {
      // On remplace une 2M : il faut aussi une main gauche, la meilleure autre que cette arme.
      const off = twoHanded ? offHands.find((x) => itemKey(x.item) !== itemKey(c.item)) : undefined
      mainList.push({
        item: c.item,
        score: c.s,
        gain: c.s + (twoHanded ? (off?.s ?? 0) : currentOff) - currentSet,
        with: off?.item,
      })
    }
  }
  out.push(advice('MAIN_HAND', mainList))

  if (!twoHanded) {
    const current = eqScore('OFF_HAND', true)
    out.push(advice('OFF_HAND', offHands.map((c) => ({ item: c.item, score: c.s, gain: c.s - current })), true))
  }

  // Distance / relique.
  const rangedCurrent = eqScore('RANGED')
  out.push(
    advice(
      'RANGED',
      scored.filter((c) => SLOTS_FOR[c.item.slot].includes('RANGED')).map((c) => ({ item: c.item, score: c.s, gain: c.s - rangedCurrent })),
    ),
  )

  // Les slots avec le plus gros gain d'abord.
  return out.sort((x, y) => (y.candidates[0]?.gain ?? 0) - (x.candidates[0]?.gain ?? 0))
}
