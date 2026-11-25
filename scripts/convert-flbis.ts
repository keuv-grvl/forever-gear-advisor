// PROTOTYPE LOCAL. Convertit les poids de l'addon Forever Leveling BiS (Thunder) en JSON pour l'app, en local seulement.
// Leur licence interdit toute copie sans permission écrite de l'auteur : le code de l'addon (docs/ForeverLevelingBiS/)
// et le fichier produit (public/data/local/) sont dans .gitignore, et l'app ne lit ce fichier qu'en développement
// (src/lib/data.ts). Ne rien versionner ni déployer de ces poids tant que l'auteur n'a pas donné son accord.
//
// Usage : npm run data:flbis   (après avoir copié l'addon dans docs/ForeverLevelingBiS/)

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const ADDON = 'docs/ForeverLevelingBiS'
const OUT = 'public/data/local/weights-flbis.json'

type Lua = number | string | boolean | null | LuaTable
interface LuaTable {
  [key: string]: Lua
}

/** Analyse le constructeur de table Lua qui suit `ns.ModelWeights =` (champs, listes, nombres, chaînes). */
function parseLuaTable(src: string, start: number): LuaTable {
  let i = start
  const skip = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++
      if (src.startsWith('--', i)) {
        while (i < src.length && src[i] !== '\n') i++
      } else return
    }
  }
  const value = (): Lua => {
    skip()
    const ch = src[i]
    if (ch === '{') return table()
    if (ch === '"' || ch === "'") {
      const end = src.indexOf(ch, i + 1)
      const s = src.slice(i + 1, end)
      i = end + 1
      return s
    }
    const m = /^(-?\d+(?:\.\d+)?(?:e-?\d+)?|true|false|nil)/.exec(src.slice(i, i + 40))
    if (!m) throw new Error(`valeur Lua inattendue à ${i} : ${src.slice(i, i + 30)}`)
    i += m[0].length
    return m[0] === 'true' ? true : m[0] === 'false' ? false : m[0] === 'nil' ? null : Number(m[0])
  }
  const table = (): LuaTable => {
    i++ // {
    const out: LuaTable = {}
    let n = 1
    for (;;) {
      skip()
      if (src[i] === '}') {
        i++
        return out
      }
      const named = /^([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(src.slice(i, i + 80))
      const bracketed = /^\[\s*"([^"]+)"\s*\]\s*=/.exec(src.slice(i, i + 80))
      if (named) {
        i += named[0].length
        out[named[1]] = value()
      } else if (bracketed) {
        i += bracketed[0].length
        out[bracketed[1]] = value()
      } else out[String(n++)] = value()
      skip()
      if (src[i] === ',' || src[i] === ';') i++
    }
  }
  return value() as LuaTable
}

const list = (t: Lua | undefined): LuaTable[] =>
  t && typeof t === 'object'
    ? Object.keys(t)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => t[k] as LuaTable)
    : []

/** Tranche de l'addon → { upTo, stats } ; speedRef = { speed = 3.35 } rejoint stats (speedRef, ohSpeedRef…). */
function bracket(b: LuaTable) {
  const stats = { ...(b.stats as Record<string, number>) }
  for (const [k, v] of Object.entries((b.speedRef as Record<string, number>) ?? {})) stats[`${k}Ref`] = v
  return { upTo: b.upTo as number, stats }
}

if (!existsSync(`${ADDON}/Data/ModelWeights.lua`)) {
  console.error(`Pas de ${ADDON}/Data/ModelWeights.lua : copier l'addon Forever Leveling BiS dans ${ADDON}/.`)
  process.exit(1)
}
const src = await readFile(`${ADDON}/Data/ModelWeights.lua`, 'utf8')
const toc = await readFile(`${ADDON}/ForeverLevelingBiS.toc`, 'utf8').catch(() => '')
const version = /^## Version:\s*(.+)$/m.exec(toc)?.[1]?.trim() ?? '?'
const model = parseLuaTable(src, src.indexOf('{', src.indexOf('ns.ModelWeights')))

const weights: Record<string, Record<string, unknown>> = {}
let specs = 0
for (const [cls, specTables] of Object.entries(model)) {
  weights[cls] = {}
  for (const [spec, w] of Object.entries(specTables as LuaTable)) {
    const t = w as LuaTable
    const setups = t.setups as LuaTable | undefined
    weights[cls][spec] = {
      brackets: list(t.brackets).map(bracket),
      ...(setups && {
        setups: Object.fromEntries(Object.entries(setups).map(([k, s]) => [k, { brackets: list((s as LuaTable).brackets).map(bracket) }])),
      }),
    }
    specs++
  }
}
await mkdir('public/data/local', { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: `Forever Leveling BiS ${version} (Thunder), Data/ModelWeights.lua — usage local, copie soumise à permission`,
    weights,
  }) + '\n',
)
console.log(`${OUT} : ${specs} spés (Forever Leveling BiS ${version})`)
