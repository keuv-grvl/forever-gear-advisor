// Langue de l'interface : celles de Wowhead. Textes de l'interface (src/i18n/*.ts), noms du jeu (public/data/i18n/,
// générés depuis l'API Forever), locale des appels à l'API Blizzard et langue des liens Wowhead.

import { ref, shallowRef, watch } from 'vue'
import { en, type MessageKey, type Messages } from './en'
import { fr } from './fr'

export type { MessageKey }

export const LANGS = [
  { code: 'en', label: 'English', locale: 'en_US', bcp47: 'en' },
  { code: 'de', label: 'Deutsch', locale: 'de_DE', bcp47: 'de' },
  { code: 'es', label: 'Español', locale: 'es_ES', bcp47: 'es' },
  { code: 'fr', label: 'Français', locale: 'fr_FR', bcp47: 'fr' },
  { code: 'it', label: 'Italiano', locale: 'it_IT', bcp47: 'it' },
  { code: 'pt', label: 'Português Brasileiro', locale: 'pt_BR', bcp47: 'pt-BR' },
  { code: 'ru', label: 'Русский', locale: 'ru_RU', bcp47: 'ru' },
  { code: 'ko', label: '한국어', locale: 'ko_KR', bcp47: 'ko' },
  { code: 'cn', label: '简体中文', locale: 'zh_CN', bcp47: 'zh-CN' },
  { code: 'tw', label: '繁體中文', locale: 'zh_TW', bcp47: 'zh-TW' },
] as const
export type Lang = (typeof LANGS)[number]['code']

// Anglais et français dans le bundle ; les autres chargés à la demande.
const LOADERS: Record<Lang, () => Promise<Messages>> = {
  en: async () => en,
  fr: async () => fr,
  de: () => import('./de').then((m) => m.de),
  es: () => import('./es').then((m) => m.es),
  it: () => import('./it').then((m) => m.it),
  pt: () => import('./pt').then((m) => m.pt),
  ru: () => import('./ru').then((m) => m.ru),
  ko: () => import('./ko').then((m) => m.ko),
  cn: () => import('./cn').then((m) => m.cn),
  tw: () => import('./tw').then((m) => m.tw),
}

const STORAGE_KEY = 'fga.lang'

function isLang(v: unknown): v is Lang {
  return LANGS.some((l) => l.code === v)
}

/** Langue gardée, sinon celle du navigateur (zh-TW / zh-HK → tw, zh → cn), sinon l'anglais. */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    // stockage indisponible
  }
  const prefs = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]
  for (const tag of prefs) {
    const t = tag.toLowerCase()
    if (t.startsWith('zh')) return /tw|hk|mo|hant/.test(t) ? 'tw' : 'cn'
    const base = t.split('-')[0]
    if (isLang(base)) return base
  }
  return 'en'
}

export const lang = ref<Lang>(initialLang())
const messages = shallowRef<Messages>(lang.value === 'fr' ? fr : en)

export function langInfo(code: Lang = lang.value) {
  return LANGS.find((l) => l.code === code) ?? LANGS[0]
}

/** Texte de l'interface ; {x} remplacé par params.x. Repli sur l'anglais. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const s = messages.value[key] ?? en[key]
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s
}

// Noms du jeu dans la langue (objets, quêtes, sous-classes, métiers, factions), générés par scripts/build-data.ts.
export interface GameNames {
  items: Record<number, string>
  quests: Record<number, string>
  subclasses: Record<string, string>
  professions: Record<string, string>
  factions: Record<string, string>
  /** Spés, clé = nom anglais de l'API (« Elemental Combat »). */
  specs: Record<string, string>
  /** Suffixes aléatoires (« de la baleine »), clé = liste de bonus du client. */
  suffixes?: Record<number, string>
}
const names = shallowRef<GameNames | null>(null)
const namesCache = new Map<Lang, Promise<GameNames | null>>()

function loadNames(code: Lang): Promise<GameNames | null> {
  if (code === 'en') return Promise.resolve(null) // les données de base sont en anglais
  let p = namesCache.get(code)
  if (!p) {
    p = fetch(`/data/i18n/${code}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<GameNames>) : null))
      .catch(() => null)
    namesCache.set(code, p)
  }
  return p
}

export const itemName = (id: number, fallback: string) => names.value?.items[id] ?? fallback
/**
 * Nom d'un objet à stats aléatoires : nom de base et suffixe traduits, dans l'ordre du jeu (« Chapeau de sorcier de
 * l'Ancien », « 고래의 … », « 巨鲸之… »). S'il manque l'un des deux, le nom anglais complet.
 */
export function suffixedName(id: number, suffix: number, fallback: string): string {
  const base = names.value?.items[id]
  const sfx = names.value?.suffixes?.[suffix]
  if (!base || !sfx) return fallback
  if (lang.value === 'ko') return `${sfx} ${base}`
  if (lang.value === 'cn' || lang.value === 'tw') return sfx + base
  return `${base} ${sfx}`
}
export const questTitle = (id: number, fallback: string) => names.value?.quests[id] ?? fallback
export const subclassName = (en: string) => names.value?.subclasses[en] ?? en
export const professionName = (en: string) => names.value?.professions[en] ?? en
export const factionName = (en: string) => names.value?.factions[en] ?? en

/** Nom de spé dans la langue ; « Feral Combat » et « Feral » sont la même spé (comme findSpec). */
const normSpec = (s: string) => s.toLowerCase().replace(/ combat$/, '')
export function specName(en: string): string {
  const specs = names.value?.specs
  if (!specs) return en
  const key = Object.keys(specs).find((k) => normSpec(k) === normSpec(en))
  return key ? specs[key] : en
}

/** Montant en cuivre → « 12 po 34 pa » (cuivre affiché seulement sous 1 po). */
export function formatMoney(copper: number): string {
  const [g, s, c] = [Math.floor(copper / 10000), Math.floor(copper / 100) % 100, copper % 100]
  const u = (n: number, k: 'money.g' | 'money.s' | 'money.c') => `${n} ${t(k)}`
  if (g > 0) return s > 0 ? `${u(g, 'money.g')} ${u(s, 'money.s')}` : u(g, 'money.g')
  if (s > 0) return c > 0 ? `${u(s, 'money.s')} ${u(c, 'money.c')}` : u(s, 'money.s')
  return u(c, 'money.c')
}

/** Lien Wowhead Forever dans la langue choisie (`/forever/fr/item=…`, l'anglais sans préfixe). */
export function wowheadUrl(kind: 'item' | 'quest' | 'npc', id: number): string {
  const prefix = lang.value === 'en' ? '' : `${lang.value}/`
  return `https://www.wowhead.com/forever/${prefix}${kind}=${id}`
}

// Changement de langue : textes, noms du jeu, attribut lang du document, choix gardé.
watch(
  lang,
  async (code) => {
    const [m, n] = await Promise.all([LOADERS[code]().catch(() => en), loadNames(code)])
    if (lang.value !== code) return // changé entre-temps
    messages.value = m
    names.value = n
    if (typeof document !== 'undefined') document.documentElement.lang = langInfo(code).bcp47
    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // stockage indisponible
    }
  },
  { immediate: true },
)
