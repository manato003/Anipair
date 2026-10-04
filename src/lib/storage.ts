import type { GithubConnection } from './github'
import { parseSlug, toSlug, type Season } from './season'

// 端末に保存する値。読むときは必ず形を確かめ、壊れていたら無かったことにする
// （保存済みの壊れた値で描画が落ち続けるのを防ぐ）

const KEYS = {
  annictToken: 'animax.annictToken',
  backfillSeason: 'animax.backfill.season',
  // 旧: 「見てない」の作品 ID の配列。いまは unseen に移した（読んで移したら消す）
  skipped: 'animax.backfill.skipped',
  unseen: 'animax.backfill.unseen',
  // 旧: 前の版の表紙の控え（animax.covers.v1。別の出どころの画像で、形も違う）。新しい鍵（v2）に切り替えて、旧い方は clearLegacyCovers で消す
  legacyCovers: 'animax.covers.v1',
  covers: 'animax.covers.v2',
  similar: 'animax.similar.v1',
  githubToken: 'animax.githubToken',
  githubRepo: 'animax.githubRepo',
  passes: 'animax.passes',
  keymap: 'animax.keymap',
  matchFilter: 'animax.match.filter',
  backup: 'animax.backup',
  // 自分の感想の控え（差分で読むための印つき）。今のトークンの持ち主のもので、トークンが変わったら消す
  reviews: 'animax.reviews.v1',
  // 初めての人への案内（評価画面の「Anipair の使い方」）を見たか。端末ごと
  onboarding: 'animax.onboarding.v1',
  // スマホで「シートはタップで閉じる」の案内を見たか
  sheetHint: 'animax.sheetHint.v1',
} as const

export const ALL_KEYS: readonly string[] = Object.values(KEYS)

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 保存できない環境（プライベートブラウズ等）では、その回の操作だけ有効にする
  }
}

function readJson(key: string): unknown {
  const raw = read(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function loadAnnictToken(): string | null {
  const t = read(KEYS.annictToken)
  return t && t.trim() ? t.trim() : null
}

export function saveAnnictToken(token: string | null): void {
  // 感想の控えは、いまログインしている人のもの（トークンそのものは控えに置けない）。
  // 別の値に変わった・消えたら、別のアカウントの感想を混ぜないよう控えも消す
  const next = token && token.trim() ? token.trim() : null
  if (loadAnnictToken() !== next) write(KEYS.reviews, null)
  write(KEYS.annictToken, token)
}

export function loadGithubToken(): string | null {
  const t = read(KEYS.githubToken)
  return t && t.trim() ? t.trim() : null
}

export function saveGithubToken(token: string | null): void {
  write(KEYS.githubToken, token)
}

// データを置く GitHub のリポジトリ（owner/name）。利用者が設定で決める。
// 通信の URL に入るので、読むときも入力のときも、この形のものだけを通す（owner は英数字とハイフン、name は英数字・ . _ -）
const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export function parseRepo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const repo = value.trim()
  if (!REPO_PATTERN.test(repo)) return null
  // 「.」「..」は URL の経路として解釈されてしまうので除く
  const name = repo.split('/')[1]
  return name === '.' || name === '..' ? null : repo
}

export function loadGithubRepo(): string | null {
  return parseRepo(read(KEYS.githubRepo))
}

export function saveGithubRepo(repo: string | null): void {
  write(KEYS.githubRepo, repo)
}

// トークンとリポジトリの両方がそろったときだけ GitHub につながっているとみなす（片方だけなら端末だけで動く）
export function loadGithubConnection(): GithubConnection | null {
  const token = loadGithubToken()
  const repo = loadGithubRepo()
  return token && repo ? { token, repo } : null
}

// パスの記録そのものの検証は features/match/passes.ts の parsePasses が行う
export function loadPassesRaw(): unknown {
  return readJson(KEYS.passes)
}

export function savePassesRaw(value: unknown): void {
  write(KEYS.passes, JSON.stringify(value))
}

// マッチングの絞り込み条件の検証は features/match/matchFilter.ts の parseMatchFilter が行う
export function loadMatchFilterRaw(): unknown {
  return readJson(KEYS.matchFilter)
}

export function saveMatchFilterRaw(value: unknown): void {
  write(KEYS.matchFilter, JSON.stringify(value))
}

// バックアップの前回の結果の検証は features/backup/backupStore.ts の parseBackupStatus が行う
export function loadBackupStatusRaw(): unknown {
  return readJson(KEYS.backup)
}

export function saveBackupStatusRaw(value: unknown): void {
  write(KEYS.backup, JSON.stringify(value))
}

// 自分の感想の控えの検証は lib/myReviews.ts の parseReviewsSnapshot が行う
export function loadReviewsRaw(): unknown {
  return readJson(KEYS.reviews)
}

export function saveReviewsRaw(value: unknown): void {
  write(KEYS.reviews, JSON.stringify(value))
}

export function clearReviewsRaw(): void {
  write(KEYS.reviews, null)
}

// 「Anipair の使い方」を見たか。{ v: 1, at: 見た日時 } の形のときだけ「見た」とみなす（壊れていれば、もう一度出す）
export function parseOnboardingSeen(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const { v, at } = value as Record<string, unknown>
  return v === 1 && typeof at === 'string'
}

export function loadOnboardingSeen(): boolean {
  return parseOnboardingSeen(readJson(KEYS.onboarding))
}

export function saveOnboardingSeen(seen: boolean): void {
  write(KEYS.onboarding, seen ? JSON.stringify({ v: 1, at: new Date().toISOString() }) : null)
}

// 「シートはタップで閉じます」の案内を見たか（形は使い方の案内と同じ）
export function loadSheetHintSeen(): boolean {
  return parseOnboardingSeen(readJson(KEYS.sheetHint))
}

export function saveSheetHintSeen(): void {
  write(KEYS.sheetHint, JSON.stringify({ v: 1, at: new Date().toISOString() }))
}

// キー割り当ての検証は lib/keymap.ts の parseKeymap が行う
export function loadKeymapRaw(): unknown {
  return readJson(KEYS.keymap)
}

export function saveKeymapRaw(value: unknown): void {
  write(KEYS.keymap, JSON.stringify(value))
}

export function loadBackfillSeason(): Season | null {
  return parseSlug(read(KEYS.backfillSeason))
}

export function saveBackfillSeason(season: Season): void {
  write(KEYS.backfillSeason, toSlug(season))
}

// 「見てない」の記録そのものの検証は features/rate/unseen.ts の parseUnseen が行う
export function loadUnseenRaw(): unknown {
  return readJson(KEYS.unseen)
}

export function saveUnseenRaw(value: unknown): void {
  write(KEYS.unseen, JSON.stringify(value))
}

// 旧形式（Annict の作品 ID の配列）。保存が無ければ null
export function parseSkipped(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => Number.isInteger(v) && v > 0)
}

export function loadLegacySkippedRaw(): unknown {
  return readJson(KEYS.skipped)
}

export function clearLegacySkipped(): void {
  write(KEYS.skipped, null)
}

// 表紙。url は大きく出す画像（評価・マッチングのカードと詳細）、thumb は一覧の小さい画像。
// landscape は Annict の API の画像（公式サイトの横長の画像）で、縦長の枠では中央を切り取って出す（詳細だけは切らずに出す）
export interface Cover {
  url: string
  thumb: string
  landscape: boolean
}

// Shikimori のポスター（MyAnimeList の ID ごと）。o は大きい画像（約 700×1000）、m は小さい画像（225×318）
export interface Poster {
  o: string
  m: string
}

const isHttps = (v: unknown): v is string => typeof v === 'string' && /^https:\/\//.test(v)

export function parsePosters(value: unknown): Map<number, Poster> {
  const out = new Map<number, Poster>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { o, m } = v as Record<string, unknown>
    if (isHttps(o) && isHttps(m)) out.set(id, { o, m })
  }
  return out
}

export function loadPosters(): Map<number, Poster> {
  return parsePosters(readJson(KEYS.covers))
}

export function savePosters(posters: Map<number, Poster>): void {
  write(KEYS.covers, JSON.stringify(Object.fromEntries(posters)))
}

// 前の版は表紙を animax.covers.v1 に控えていた。使わないので消す（いつ呼んでも害は無い）
export function clearLegacyCovers(): void {
  write(KEYS.legacyCovers, null)
}

// 似た作品の一覧の控え（MyAnimeList の ID ごと。at は取った時刻のミリ秒）。作品どうしの関係はほとんど変わらないので長く使い回す
export const SIMILAR_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SIMILAR_MAX_ENTRIES = 500

export interface SimilarEntry {
  at: number
  ids: number[]
}

// 形の壊れたもの・期限の切れたものは捨てる。多すぎるときは古いものから捨てる
export function parseSimilar(value: unknown, now: number): Map<number, SimilarEntry> {
  const out = new Map<number, SimilarEntry>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { at, ids } = v as Record<string, unknown>
    if (typeof at !== 'number' || !Number.isFinite(at) || now - at >= SIMILAR_TTL_MS || at > now + 60_000) continue
    if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n) && n > 0)) continue
    out.set(id, { at, ids: ids as number[] })
  }
  if (out.size <= SIMILAR_MAX_ENTRIES) return out
  return new Map([...out].sort((a, b) => b[1].at - a[1].at).slice(0, SIMILAR_MAX_ENTRIES))
}

export function loadSimilar(now: number = Date.now()): Map<number, SimilarEntry> {
  return parseSimilar(readJson(KEYS.similar), now)
}

export function saveSimilar(entries: Map<number, SimilarEntry>): void {
  write(KEYS.similar, JSON.stringify(Object.fromEntries(entries)))
}

// 「Annict でログイン」の state（なりすましの確認用）。ログイン画面へ行って戻ってくるまでの間だけ、そのタブの sessionStorage に置く
const OAUTH_STATE_KEY = 'animax.annictOauthState'

export function loadOauthState(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_STATE_KEY)
  } catch {
    return null
  }
}

export function saveOauthState(state: string | null): void {
  try {
    if (state === null) sessionStorage.removeItem(OAUTH_STATE_KEY)
    else sessionStorage.setItem(OAUTH_STATE_KEY, state)
  } catch {
    // 保存できない環境では、ログインの照合ができず、戻ってきたときに断られる
  }
}

export function clearAll(): void {
  for (const k of ALL_KEYS) write(k, null)
}
