import { useEffect, useSyncExternalStore } from 'react'
import { getLang } from './i18n'

// 声優・スタッフの英語名（英語の画面だけ。lib/names.ts の personName が引く）。
// Annict の英語の表記はほとんど空で（2026-10-20 に数えた: 声優 70人中2人、スタッフ 112人中5人）、
// Shikimori の作品のデータには声優が入っていないので、Wikidata（Wikipedia の姉妹プロジェクト。データは CC0）を日本語名で引く。
// 1回の問い合わせ（SPARQL）で、作品の詳細に出る人をまとめて引く。人（Q5）だけに絞る（同じ名前の作品や団体を拾わない）。
// 引けた名前・引けなかった名前とも、端末に残す（同じ人を何度も問い合わせない。利用者の記録ではないので、持ち主ごとには分けない）
const ENDPOINT = 'https://query.wikidata.org/sparql'
const KEY = 'animax.peopleEn.v1'
// 1回に引く人数（問い合わせの長さを抑える）
const BATCH = 40
// 端末に残す数の上限（新しく覚えた順に残す）
const MAX = 4000

// 日本語名 → 英語名（引けなかった人は ''）
let names: Map<string, string> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()
const pending = new Set<string>()

function load(): Map<string, string> {
  if (names) return names
  names = new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [ja, en] of Object.entries(raw as Record<string, unknown>)) if (typeof en === 'string') names.set(ja, en)
    }
  } catch {
    // 読めない・壊れているときは、空から覚え直す
  }
  return names
}

function save(): void {
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...load()].slice(-MAX))))
    } catch {
      // 保存できない環境では、この起動のあいだだけ覚える
    }
  }, 1000)
}

function changed(): void {
  version++
  listeners.forEach((l) => l())
}

// 覚えている英語名。引けなかった人・まだ引いていない人は null
export function englishPersonOf(name: string): string | null {
  return load().get(name.trim()) || null
}

// SPARQL の文字列（日本語名）に入れられる形か。引用符・バックスラッシュ・改行のある名前は問い合わせない
const safe = (s: string) => s.length > 0 && s.length <= 60 && !/["\\\n\r]/.test(s)

async function query(batch: readonly string[]): Promise<Map<string, string>> {
  const values = batch.map((n) => `"${n}"@ja`).join(' ')
  const sparql = `SELECT ?ja ?en WHERE { VALUES ?ja { ${values} } ?item rdfs:label ?ja; wdt:P31 wd:Q5; rdfs:label ?en. FILTER(LANG(?en) = "en") }`
  const res = await fetch(`${ENDPOINT}?${new URLSearchParams({ query: sparql, format: 'json' })}`, { credentials: 'omit', headers: { Accept: 'application/sparql-results+json' } })
  if (!res.ok) throw new Error(`Wikidata ${res.status}`)
  const body = (await res.json()) as { results?: { bindings?: { ja?: { value?: string }; en?: { value?: string } }[] } }
  const out = new Map<string, string>()
  for (const b of body.results?.bindings ?? []) {
    const ja = b.ja?.value
    const en = b.en?.value
    if (ja && en && !out.has(ja)) out.set(ja, en)
  }
  return out
}

// まだ引いていない人を、まとめて引く（英語の画面のときだけ）。失敗したら覚えずに終わる（次に開いたときにもう一度）
export async function loadEnglishPeople(list: readonly string[]): Promise<void> {
  if (getLang() !== 'en') return
  const map = load()
  const todo = [...new Set(list.map((n) => n.trim()))].filter((n) => safe(n) && !map.has(n) && !pending.has(n))
  if (todo.length === 0) return
  todo.forEach((n) => pending.add(n))
  try {
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH)
      const got = await query(batch)
      for (const n of batch) map.set(n, got.get(n) ?? '')
      save()
      changed()
    }
  } catch (e) {
    console.warn('Wikidataから英語名を取れませんでした', e) // i18n-ok: 開発者向けのログ
  } finally {
    todo.forEach((n) => pending.delete(n))
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 画面に出す人の英語名を引き、引けたら描き直す（英語の画面だけ。日本語の画面では何もしない）
export function useEnglishPeople(list: readonly string[]): void {
  const key = list.join('\u0000')
  useSyncExternalStore(subscribe, () => version, () => 0)
  useEffect(() => {
    if (key) void loadEnglishPeople(key.split('\u0000'))
  }, [key])
}

// テスト用
export function resetEnglishPeopleForTests(seed: Record<string, string> = {}): void {
  names = new Map(Object.entries(seed))
  version = 0
}
