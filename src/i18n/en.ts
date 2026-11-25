// Textes de l'interface, en anglais : la référence (clés et repli). Chaque langue a un fichier avec les mêmes clés.
// {x} : valeur insérée à l'affichage. Termes de jeu : ceux du client WoW dans la langue.

export const en = {
  // Formulaire et messages généraux
  'form.language': 'Language',
  'form.region': 'Region',
  'form.character': 'Character',
  'form.placeholder': 'First Last (e.g. Helga Tartine)',
  'form.load': 'Load',
  'form.loading': 'Loading…',
  'error.name': 'Enter the character’s first and last name, for example “Helga Tartine”.',
  'error.notFound': 'Character “{name}” not found in {region}.',
  'error.generic': 'Error: {message}',
  'error.render': 'Display error: {message}',
  'error.gameData': 'Item data unavailable: {message}',
  'loading.gameData': 'Loading item data…',

  // Résumé du perso
  'summary.level': 'Level {level}',
  'summary.points': '{points} pts',
  'summary.noSpec': 'spec not detected',
  'summary.itemLevel': 'average item level {ilvl}',

  // Emplacements (ordre de la fiche personnage)
  'slot.HEAD': 'Head',
  'slot.NECK': 'Neck',
  'slot.SHOULDER': 'Shoulder',
  'slot.BACK': 'Back',
  'slot.CHEST': 'Chest',
  'slot.SHIRT': 'Shirt',
  'slot.TABARD': 'Tabard',
  'slot.WRIST': 'Wrist',
  'slot.HANDS': 'Hands',
  'slot.WAIST': 'Waist',
  'slot.LEGS': 'Legs',
  'slot.FEET': 'Feet',
  'slot.FINGER_1': 'Finger 1',
  'slot.FINGER_2': 'Finger 2',
  'slot.TRINKET_1': 'Trinket 1',
  'slot.TRINKET_2': 'Trinket 2',
  'slot.MAIN_HAND': 'Main Hand',
  'slot.OFF_HAND': 'Off Hand',
  'slot.RANGED': 'Ranged',

  // Tableau d'équipement
  'equip.title': 'Equipment',
  'equip.slot': 'Slot',
  'equip.item': 'Item',
  'equip.itemLevel': 'Item level',
  'equip.reqLevel': 'Req. level',
  'equip.type': 'Type',
  'equip.stats': 'Stats',
  'equip.empty': 'empty',
  'equip.armor': '{value} armor',
  'equip.dps': '{dps} DPS ({speed})',
  'equip.resistances': 'resistances',

  // Améliorations : options
  'reco.title': 'Upgrades',
  'reco.spec': 'Spec',
  'reco.sortBy': 'Sort by',
  'reco.sortGain': 'Gain',
  'reco.sortSlot': 'Slot',
  'reco.mainArmor': 'Main armor type only',
  'reco.anticipate': 'Look ahead (+5 levels)',
  'reco.origin': 'Origin',
  'reco.pickOrigin': 'Check at least one origin.',
  'origin.quest': 'Quests',
  'origin.dungeon': 'Dungeon or raid quests',
  'origin.craft': 'Crafting',
  'origin.vendor': 'Vendors',
  'origin.boe': 'Bind on Equip loot',
  'origin.rep': 'Reputation',
  'origin.unknown': 'Unknown source',

  // Améliorations : tableau
  'reco.colSlot': 'Slot',
  'reco.colEquipped': 'Equipped (score)',
  'reco.colEquippedTitle': 'Score: sum of the item’s stats, weighted for the spec',
  'reco.colBest': 'Best option',
  'reco.empty': 'empty',
  'reco.nothing': 'Nothing better found',
  'reco.moreOne': '1 more option',
  'reco.moreMany': '{n} more options',

  // Infobulles
  'hint.spec': 'Stats are not worth the same for every spec (Polestar weights). Default: the spec with the most talent points.',
  'hint.sort': 'Gain: slots with the biggest upgrade first. Slot: character sheet order (head, neck, shoulder…).',
  'hint.anticipate': 'Also suggests items up to 5 levels above yours, to plan ahead. The required level is shown next to each item.',
  'hint.origins':
    'An item is suggested if at least one of its sources is checked. “Bind on Equip loot”: tradable items with no other known source, usually loot from monsters or chests, often sold at the Auction House. Unchecking “Reputation” removes every item that requires a reputation, whatever its source. Bind on Pickup drops (dungeon bosses…) are not in the data: they fall under “Unknown source”. Random-stat items (“of the Whale”, “of the Bear”…) are suggested only when they are for sale at the Auction House (weapons excluded). A Bind on Pickup craft is suggested only if your character has the profession; a Bind on Equip craft always is (someone can craft it for you).',
  'hint.armorOnly': 'Your class only wears {best}: this option changes nothing.',
  'hint.armor':
    'Checked: for head, shoulders, chest, wrists, hands, waist, legs and feet, only {best} armor, the heaviest type your class wears at level {level}. Unchecked: {lighter} armor too (less armor, sometimes better stats). Back, neck, fingers and trinkets are not affected.',
  'armor.1': 'cloth',
  'armor.2': 'leather',
  'armor.3': 'mail',
  'armor.4': 'plate',
  'list.and': ' and ',

  // Une option proposée
  'cand.level': 'lvl {level}',
  'cand.levelRequired': 'Required level',
  'cand.levelEstimated': 'Estimated level: the API gives no required level',
  'cand.with': 'with',
  'src.craft': 'Crafting: {prof}',
  'src.craftKnown': "recipe known",
  'src.craftToLearn': "recipe to learn",
  'src.craftOther': "not your profession: have it crafted",
  'src.vendor': 'Vendor:',
  'src.quest': 'Quest:',
  'src.questDungeon': 'Dungeon quest:',
  'src.questRaid': 'Raid quest:',
  'src.questLevel': '(lvl {level})',
  'src.inProgress': 'in progress',
  'src.rep': 'Reputation: {faction} ({standing})',
  'src.boe': 'Bind on Equip loot',
  'src.unknown': 'unknown source, see Wowhead',
  'src.random': "Random-stat loot",
  'src.randomNote':
    "Stats computed from the WoW Forever client tables. Base item quality and levels: from the client when it has them, otherwise from forever-db (fatedfr), since the Forever API does not know these items.",
  'src.ah': 'AH: {price}',
  'price.note':
    'Lowest price, median over the {houses} {faction} auction houses of this game mode (the API does not say which one your character uses). Snapshot from {when}.',
  'standing.0': 'Hated',
  'standing.1': 'Hostile',
  'standing.2': 'Unfriendly',
  'standing.3': 'Neutral',
  'standing.4': 'Friendly',
  'standing.5': 'Honored',
  'standing.6': 'Revered',
  'standing.7': 'Exalted',
  // Abréviations or / argent / cuivre
  'money.g': 'g',
  'money.s': 's',
  'money.c': 'c',

  // Pied du tableau ({polestar} : lien)
  'reco.footer':
    'Score: sum of the stats weighted for the spec ({polestar} weights, GPL-3.0). The gain is the difference with the equipped item. “~”: estimated level, the API gives no required level. Items: Blizzard API, WoW Forever ({date}); quests: forever-db (Polestar); vendors: forever-db (fatedfr). Bind on Pickup drops are not shown. Random-stat items (“of the Whale”): only those for sale at the Auction House, weapons excluded; stats from the WoW Forever client, base item quality and levels from forever-db (fatedfr).',
  'reco.footerNpc': '',
}

export type Messages = typeof en
export type MessageKey = keyof Messages
