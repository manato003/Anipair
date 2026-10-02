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
  covers: 'animax.covers.v1',
  githubToken: 'animax.githubToken',
  githubRepo: 'animax.githubRepo',
  passes: 'animax.passes',
  keymap: 'animax.keymap',
  matchFilter: 'animax.match.filter',
  backup: 'animax.backup',
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

export interface Cover {
  url: string
  color: string | null
}

export function parseCovers(value: unknown): Map<number, Cover> {
  const out = new Map<number, Cover>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || !v || typeof v !== 'object') continue
    const { url, color } = v as Record<string, unknown>
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) continue
    out.set(id, { url, color: typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : null })
  }
  return out
}

export function loadCovers(): Map<number, Cover> {
  return parseCovers(readJson(KEYS.covers))
}

export function saveCovers(covers: Map<number, Cover>): void {
  write(KEYS.covers, JSON.stringify(Object.fromEntries(covers)))
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
