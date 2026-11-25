// Génère public/data/weights.json à partir des tables de poids de Polestar (GPL-3.0).
// Usage : npm run data:weights
// Source figée sur un commit pour que la sortie soit reproductible ; changer POLESTAR_COMMIT pour la mettre à jour.

import { mkdir, writeFile } from 'node:fs/promises'

const POLESTAR_COMMIT = 'aafd6e4e1055e294a0300dddb0a79b9f503bf314' // 2026-11-13
const SOURCE_URL = `https://raw.githubusercontent.com/fitzforge/polestar/${POLESTAR_COMMIT}/docs/gear-weights.md`
const OUT = 'public/data/weights.json'

// Libellé Polestar → clé de poids utilisée par l'app (src/lib/scoring.ts).
const LABELS: Record<string, string> = {
  Strength: 'STRENGTH',
  Agility: 'AGILITY',
  Stamina: 'STAMINA',
  Intellect: 'INTELLECT',
  Spirit: 'SPIRIT',
  'Attack power': 'ATTACK_POWER',
  'Ranged attack power': 'RANGED_ATTACK_POWER',
  'Spell damage': 'SPELL_DAMAGE',
  Healing: 'HEALING',
  'Arcane damage': 'ARCANE_DAMAGE',
  'Fire damage': 'FIRE_DAMAGE',
  'Frost damage': 'FROST_DAMAGE',
  'Holy damage': 'HOLY_DAMAGE',
  'Nature damage': 'NATURE_DAMAGE',
  'Shadow damage': 'SHADOW_DAMAGE',
  'Crit (1%)': 'CRIT',
  'Hit (1%)': 'HIT',
  'Spell crit (1%)': 'SPELL_CRIT',
  'Spell hit (1%)': 'SPELL_HIT',
  'Haste (1%)': 'HASTE',
  'Expertise (1%)': 'EXPERTISE',
  'Armor penetration (1%)': 'ARMOR_PENETRATION',
  'Weapon DPS': 'WEAPON_DPS',
  'Ranged weapon DPS': 'RANGED_WEAPON_DPS',
  'Health per 5 s': 'HEALTH_REGEN',
  'Mana per 5 s': 'MANA_REGEN',
  Armor: 'ARMOR',
  Defense: 'DEFENSE',
  'Dodge (1%)': 'DODGE',
  'Parry (1%)': 'PARRY',
  'Block (1%)': 'BLOCK',
  'Block value': 'BLOCK_VALUE',
  Health: 'HEALTH',
  Mana: 'MANA',
}

interface SpecWeights {
  class: string
  spec: string
  role: 'dps' | 'tank' | 'healer'
  weights: Record<string, (number | null)[]>
}

function parse(md: string): { levels: number[]; specs: SpecWeights[] } {
  const part = md.split('## The weights at levels 10 to 60')[1]
  if (!part) throw new Error('section « The weights at levels 10 to 60 » introuvable : le format de la doc a changé')
  let levels: number[] = []
  const specs: SpecWeights[] = []

  for (const section of part.split('\n#### ').slice(1)) {
    const [title, ...lines] = section.split('\n')
    // « Paladin Holy (healer) » → classe Paladin, spé Holy, rôle healer
    const m = title.trim().match(/^(\S+) (.+?)(?: \((tank|healer)\))?$/)
    if (!m) throw new Error(`titre de spé inattendu : ${title}`)
    const spec: SpecWeights = { class: m[1], spec: m[2], role: (m[3] as 'tank' | 'healer') ?? 'dps', weights: {} }

    for (const line of lines) {
      if (!line.startsWith('|')) continue
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (cells[0] === 'Stat') {
        levels = cells.slice(1).map(Number)
        continue
      }
      if (cells[0].startsWith('---')) continue
      const label = cells[0].replace(/\s*\*$/, '') // « * » = poids calculé par formule
      const key = LABELS[label]
      if (!key) throw new Error(`stat inconnue dans ${title} : « ${label} », à ajouter à LABELS`)
      spec.weights[key] = cells.slice(1).map((c) => (c === '–' || c === '-' ? null : Number(c)))
    }
    specs.push(spec)
  }
  if (specs.length !== 27) throw new Error(`27 spés attendues, ${specs.length} trouvées`)
  return { levels, specs }
}

const res = await fetch(SOURCE_URL)
if (!res.ok) throw new Error(`téléchargement impossible (HTTP ${res.status}) : ${SOURCE_URL}`)
const { levels, specs } = parse(await res.text())

await mkdir('public/data', { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    source: {
      name: 'Polestar, docs/gear-weights.md',
      url: `https://github.com/fitzforge/polestar/blob/${POLESTAR_COMMIT}/docs/gear-weights.md`,
      license: 'GPL-3.0',
    },
    note: 'Poids par point de stat (ou par 1 % pour crit, toucher, hâte, etc.), un par niveau de `levels`.',
    levels,
    specs,
  }) + '\n',
)
console.log(`${OUT} : ${specs.length} spés, niveaux ${levels.join(', ')}`)
