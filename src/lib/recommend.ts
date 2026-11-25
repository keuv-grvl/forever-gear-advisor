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
  rep?: [string, number]
  src: 'api' | 'seen'
}

export type Source =
  | { t: 'craft'; prof: string; recipe: string; reagents: [number, string, number][]; qty?: number }
  | { t: 'quest'; id: number; title?: string; lvl?: number; min?: number; side?: number; cls?: number; choice?: 1 }
  | { t: 'vendor'; npc: number; name: string; sub?: string; side?: string }

/** Côté du perso : A (Alliance) ou H (Horde). */
export function sideOf(faction: string): 'A' | 'H' {
  return faction === 'HORDE' ? 'H' : 'A'
}

/** Sources accessibles au perso : quêtes d'une autre faction ou classe, vendeurs de l'autre faction écartés. */
export function sourcesFor(sources: Source[] | undefined, side: 'A' | 'H', classId: number): Source[] {
  const questSide = side === 'A' ? 1 : 2
  const classBit = 1 << (classId - 1)
  return (sources ?? []).filter((s) => {
    if (s.t === 'quest') return (!s.side || s.side === questSide) && (!s.cls || (s.cls & classBit) !== 0)
    if (s.t === 'vendor') return !s.side || s.side.includes(side)
    return true
  })
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
  equipped?: { name: string; id: number; score: number }
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
const OFF_HAND = new Set(['SHIELD', 'HOLDABLE', 'WEAPONOFFHAND'])

export function recommend(equipped: EquippedItem[], db: DbItem[], o: RecommendOptions): SlotAdvice[] {
  const maxLevel = o.level + o.anticipate
  const dualWield = canDualWield(o.classId, maxLevel)
  const bySlot = new Map(equipped.map((e) => [e.slot.type, e]))
  const equippedIds = new Set(equipped.map((e) => e.item.id))

  const score = (it: ScorableItem, offHand = false) => scoreItem(it, o.weights, offHand)
  const eqScore = (slot: string, offHand = false) => {
    const e = bySlot.get(slot)
    return e ? score(fromEquipped(e), offHand) : 0
  }

  // Candidats portables par ce perso, au plus tard à maxLevel.
  const mainArmor = bestArmorType(o.classId, maxLevel)
  const side = sideOf(o.faction)
  // Objet dont toutes les sources connues sont réservées à l'autre faction (ex. Advisor's Gnarled Staff,
  // vendu seulement par l'intendant Chanteguerre) ou à une autre classe : inaccessible. Sans source connue, on le garde.
  const reachable = (it: DbItem) => {
    const all = o.sources[it.id]
    return !all?.length || sourcesFor(all, side, o.classId).length > 0
  }
  const usable = db.filter(
    (it) =>
      reachable(it) &&
      (it.al ?? it.rl ?? 0) <= maxLevel &&
      (!o.mainArmorOnly || it.cls !== 4 || !TYPED_ARMOR_SLOTS.has(it.slot) || it.sub === mainArmor) &&
      (!it.fac || it.fac === o.faction) &&
      !equippedIds.has(it.id) &&
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
      equipped: e ? { name: e.name, id: e.item.id, score: eqScore(slot, offHand) } : undefined,
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
  const offHandOk = (it: DbItem) => OFF_HAND.has(it.slot) || (dualWield && it.slot === 'WEAPON')
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
      const off = twoHanded ? offHands.find((x) => x.item.id !== c.item.id) : undefined
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
