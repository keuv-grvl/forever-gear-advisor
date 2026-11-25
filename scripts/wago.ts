// Tables du client WoW Forever, exportées en CSV par wago.tools (produit « wowf »). Données du client, © Blizzard
// Entertainment. Gardées dans .cache/wago/<build>/ : une build ne change pas, on ne retélécharge pas.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const WAGO = 'https://wago.tools'
const PRODUCT = 'wowf' // WoW Forever

export type Row = Record<string, string>

/** Parse un CSV (guillemets, "" échappés, retours à la ligne entre guillemets). */
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== '')
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

async function latestBuild(): Promise<string> {
  const res = await fetch(`${WAGO}/api/builds`)
  if (!res.ok) throw new Error(`wago.tools (builds) : HTTP ${res.status}`)
  const builds = (await res.json()) as Record<string, { version: string }[]>
  const v = builds[PRODUCT]?.[0]?.version
  if (!v) throw new Error(`wago.tools : aucune build ${PRODUCT}`)
  return v
}

export async function clientTable(build: string, name: string, locale?: string): Promise<Row[]> {
  const dir = `.cache/wago/${build}`
  const file = `${dir}/${name}${locale ? `.${locale}` : ''}.csv`
  if (!existsSync(file)) {
    await mkdir(dir, { recursive: true })
    const url = `${WAGO}/db2/${name}/csv?build=${build}${locale ? `&locale=${locale}` : ''}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`wago.tools ${name} : HTTP ${res.status}`)
    await writeFile(file, await res.text())
  }
  return parseCsv(await readFile(file, 'utf8'))
}

export const byId = (rows: Row[]) => new Map(rows.map((r) => [Number(r.ID), r]))
export const num = (r: Row | undefined, k: string) => Number(r?.[k] ?? 0)

let build: Promise<string> | undefined
/** Dernière build du client Forever connue de wago.tools (une seule fois par génération). */
export function clientBuild(): Promise<string> {
  build ??= latestBuild()
  return build
}
