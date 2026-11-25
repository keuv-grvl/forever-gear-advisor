// Règles d'équipement : quels objets une classe peut porter, et dans quel slot.
// Hypothèse : règles de Classic, base de Forever. Vérifiées contre l'équipement observé sur des persos Forever
// (voir docs/ROADMAP.md) ; à corriger ici si Forever s'en écarte.

// Ids de classe Blizzard.
export const CLASS = { WARRIOR: 1, PALADIN: 2, HUNTER: 3, ROGUE: 4, PRIEST: 5, SHAMAN: 7, MAGE: 8, WARLOCK: 9, DRUID: 11 }
/** Nom anglais de la classe, clé des poids Polestar (le nom renvoyé par l'API dépend de la langue). */
export const CLASS_KEYS: Record<number, string> = {
  1: 'Warrior',
  2: 'Paladin',
  3: 'Hunter',
  4: 'Rogue',
  5: 'Priest',
  7: 'Shaman',
  8: 'Mage',
  9: 'Warlock',
  11: 'Druid',
}

// Sous-classes d'armure (item_class 4).
const ARMOR = { MISC: 0, CLOTH: 1, LEATHER: 2, MAIL: 3, PLATE: 4, SHIELD: 6, LIBRAM: 7, IDOL: 8, TOTEM: 9 }
// Sous-classes d'arme (item_class 2).
const W = {
  AXE1: 0, AXE2: 1, BOW: 2, GUN: 3, MACE1: 4, MACE2: 5, POLEARM: 6, SWORD1: 7, SWORD2: 8,
  STAFF: 10, FIST: 13, MISC: 14, DAGGER: 15, THROWN: 16, CROSSBOW: 18, WAND: 19,
}

interface ClassRules {
  armor: number[]
  /** Niveau à partir duquel la classe apprend une armure plus lourde. */
  armorFrom?: Partial<Record<number, number>>
  weapons: number[]
  dualWield?: number // niveau d'apprentissage de l'ambidextrie
}

const { CLOTH, LEATHER, MAIL, PLATE, SHIELD, LIBRAM, IDOL, TOTEM, MISC } = ARMOR
const RULES: Record<number, ClassRules> = {
  [CLASS.WARRIOR]: {
    armor: [MISC, CLOTH, LEATHER, MAIL, PLATE, SHIELD],
    armorFrom: { [PLATE]: 40 },
    weapons: [W.AXE1, W.AXE2, W.BOW, W.GUN, W.MACE1, W.MACE2, W.POLEARM, W.SWORD1, W.SWORD2, W.STAFF, W.FIST, W.DAGGER, W.THROWN, W.CROSSBOW],
    dualWield: 20,
  },
  [CLASS.PALADIN]: {
    armor: [MISC, CLOTH, LEATHER, MAIL, PLATE, SHIELD, LIBRAM],
    armorFrom: { [PLATE]: 40 },
    weapons: [W.AXE1, W.AXE2, W.MACE1, W.MACE2, W.POLEARM, W.SWORD1, W.SWORD2],
  },
  [CLASS.HUNTER]: {
    armor: [MISC, CLOTH, LEATHER, MAIL],
    armorFrom: { [MAIL]: 40 },
    weapons: [W.AXE1, W.AXE2, W.BOW, W.GUN, W.POLEARM, W.SWORD1, W.SWORD2, W.STAFF, W.FIST, W.DAGGER, W.THROWN, W.CROSSBOW],
    dualWield: 20,
  },
  [CLASS.ROGUE]: {
    armor: [MISC, CLOTH, LEATHER],
    // Haches 1M : absentes en Classic, mais observées sur un voleur Forever (Greater Scythe of the Tiger).
    weapons: [W.AXE1, W.BOW, W.GUN, W.MACE1, W.SWORD1, W.FIST, W.DAGGER, W.THROWN, W.CROSSBOW],
    dualWield: 1,
  },
  [CLASS.PRIEST]: { armor: [MISC, CLOTH], weapons: [W.MACE1, W.STAFF, W.DAGGER, W.WAND] },
  [CLASS.SHAMAN]: {
    armor: [MISC, CLOTH, LEATHER, MAIL, SHIELD, TOTEM],
    armorFrom: { [MAIL]: 40 },
    weapons: [W.AXE1, W.AXE2, W.MACE1, W.MACE2, W.STAFF, W.FIST, W.DAGGER],
  },
  [CLASS.MAGE]: { armor: [MISC, CLOTH], weapons: [W.SWORD1, W.STAFF, W.DAGGER, W.WAND] },
  [CLASS.WARLOCK]: { armor: [MISC, CLOTH], weapons: [W.SWORD1, W.STAFF, W.DAGGER, W.WAND] },
  [CLASS.DRUID]: {
    armor: [MISC, CLOTH, LEATHER, IDOL],
    weapons: [W.MACE1, W.MACE2, W.STAFF, W.FIST, W.DAGGER],
  },
}

export interface Wearable {
  cls: number // item_class : 2 arme, 4 armure
  sub: number // item_subclass
  slot: string // inventory_type
  pc?: number[] // classes autorisées
}

/** La classe peut-elle porter cet objet à ce niveau ? (hors niveau requis de l'objet) */
export function canWear(classId: number, level: number, item: Wearable): boolean {
  const r = RULES[classId]
  if (!r) return true // classe inconnue : on ne filtre pas
  if (item.pc && !item.pc.includes(classId)) return false
  if (item.cls === 4) {
    // Dos, cou, doigts, bijoux : sous-classe Tissu/Divers, portables par tous.
    if (['CLOAK', 'NECK', 'FINGER', 'TRINKET', 'HOLDABLE'].includes(item.slot)) return true
    if (!r.armor.includes(item.sub)) return false
    const from = r.armorFrom?.[item.sub]
    return from === undefined || level >= from
  }
  if (item.cls === 2) return r.weapons.includes(item.sub)
  return false
}

export function canDualWield(classId: number, level: number): boolean {
  const lvl = RULES[classId]?.dualWield
  return lvl !== undefined && level >= lvl
}

/** Types d'armure (tissu, cuir, mailles, plaques) que la classe porte à ce niveau, du plus léger au plus lourd. */
export function wearableArmorTypes(classId: number, level: number): number[] {
  const r = RULES[classId]
  if (!r) return [CLOTH]
  return [CLOTH, LEATHER, MAIL, PLATE].filter((t) => r.armor.includes(t) && level >= (r.armorFrom?.[t] ?? 0))
}

/** Armure la plus lourde que la classe porte à ce niveau (utile pour préférer le bon type). */
export function bestArmorType(classId: number, level: number): number {
  return Math.max(...wearableArmorTypes(classId, level))
}


// inventory_type → slots d'équipement possibles.
export const SLOTS_FOR: Record<string, string[]> = {
  HEAD: ['HEAD'],
  NECK: ['NECK'],
  SHOULDER: ['SHOULDER'],
  CLOAK: ['BACK'],
  CHEST: ['CHEST'],
  ROBE: ['CHEST'],
  WRIST: ['WRIST'],
  HAND: ['HANDS'],
  WAIST: ['WAIST'],
  LEGS: ['LEGS'],
  FEET: ['FEET'],
  FINGER: ['FINGER_1', 'FINGER_2'],
  TRINKET: ['TRINKET_1', 'TRINKET_2'],
  WEAPON: ['MAIN_HAND', 'OFF_HAND'], // main gauche seulement si ambidextre
  WEAPONMAINHAND: ['MAIN_HAND'],
  WEAPONOFFHAND: ['OFF_HAND'],
  TWOHWEAPON: ['MAIN_HAND'],
  SHIELD: ['OFF_HAND'],
  HOLDABLE: ['OFF_HAND'],
  RANGED: ['RANGED'],
  RANGEDRIGHT: ['RANGED'],
  THROWN: ['RANGED'],
  RELIC: ['RANGED'],
}
