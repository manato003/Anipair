import { t } from '../../lib/i18n'
import { malIdOf } from '../../lib/malId'
import type { TierShare, TierTable, TierView } from './tierList'

// Tier表の共有のリンク（このサイトの関数 api/tier.ts）。リンクに入れるのは、表の題名・段の名前・作品の MyAnimeList の ID と並びだけ。
// Annict の名前とトークン・作品の評価は送らない。作品は MyAnimeList の ID で送る（見る人は Annict に問い合わせないので、/api/shiki で題名と表紙を引く）

const ENDPOINT = '/api/tier'

export interface SharedTable {
  title: string
  tiers: { name: string; items: number[] }[]
}

// リンクに入れる形。画面に出ている作品（範囲の中で段に置いた作品）だけで、MyAnimeList の ID の無い作品は入らない（数を返して画面で知らせる）。
// Annict の別々の作品が同じ MyAnimeList の ID を持つことがある（分割して登録された作品など）。上の段に置いた方だけを入れる（関数は重なりを断る）
export function sharedPayload(table: TierTable, view: TierView): { payload: SharedTable; skipped: number } {
  let skipped = 0
  const seen = new Set<number>()
  const tiers = view.tiers.map((tier) => ({
    name: tier.name,
    items: tier.rows.flatMap((r) => {
      const id = malIdOf(r.entry)
      if (id === null) skipped++
      if (id === null || seen.has(id)) return []
      seen.add(id)
      return [id]
    }),
  }))
  return { payload: { title: table.title, tiers }, skipped }
}

// リンクの中身が、いまの表より古いか（送ったあとに表を変えた）
export function isStale(table: TierTable): boolean {
  return !!table.share && Date.parse(table.updatedAt) > Date.parse(table.share.at)
}

export function shareUrl(id: string): string {
  return `${window.location.origin}/t/${id}`
}

export function shareText(title: string, url: string): string {
  return t(`Tier表「${title}」を作りました。\n${url}\n#Anipair`, `I made a tier list: “${title}”.\n${url}\n#Anipair`)
}

// /t/<ID> の ID。それ以外の道筋なら null
export function sharedIdOf(pathname: string): string | null {
  return /^\/t\/([0-9A-Za-z]{10})\/?$/.exec(pathname)?.[1] ?? null
}

const offline = () => t('つながりませんでした。通信の状態を確かめて、もう一度お試しください。', 'Couldn’t connect. Check your connection and try again.')

function messageFor(status: number): string {
  if (status === 429) return t('今日はリンクを作れる数の上限に達しました。明日もう一度お試しください。', 'You’ve reached today’s limit for new links. Please try again tomorrow.')
  if (status === 413) return t('作品が多すぎて、リンクにできません。', 'This list has too many anime to share as a link.')
  if (status === 403 || status === 401) return t('このリンクを変える鍵が合いません。', 'The key for this link doesn’t match.')
  return t(`リンクを作る仕組みが応えませんでした（${status}）。しばらく待ってからお試しください。`, `The link service didn’t respond (${status}). Please try again in a while.`)
}

export type ShareResult<T> = { ok: true; value: T } | { ok: false; message: string; missing?: boolean }

async function call(init: RequestInit & { query?: string }, fetchFn: typeof fetch): Promise<Response | null> {
  try {
    return await fetchFn(`${ENDPOINT}${init.query ?? ''}`, init)
  } catch {
    return null
  }
}

// リンクを作る。返る鍵は表と一緒に保存する（無くすと、リンクを直すことも消すこともできない）
export async function createShare(payload: SharedTable, now: Date = new Date(), fetchFn: typeof fetch = fetch): Promise<ShareResult<TierShare>> {
  const res = await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, fetchFn)
  if (!res) return { ok: false, message: offline() }
  if (!res.ok) return { ok: false, message: messageFor(res.status) }
  const body = (await res.json().catch(() => null)) as { id?: unknown; key?: unknown } | null
  if (typeof body?.id !== 'string' || typeof body.key !== 'string') return { ok: false, message: messageFor(res.status) }
  return { ok: true, value: { id: body.id, key: body.key, at: now.toISOString() } }
}

// リンクの中身を、いまの表にする
export async function updateShare(share: TierShare, payload: SharedTable, now: Date = new Date(), fetchFn: typeof fetch = fetch): Promise<ShareResult<TierShare>> {
  const res = await call(
    { query: `?id=${share.id}`, method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${share.key}` }, body: JSON.stringify(payload) },
    fetchFn,
  )
  if (!res) return { ok: false, message: offline() }
  if (res.status === 404) return { ok: false, missing: true, message: t('リンクが見つかりません（消されたか、保存先から消えました）。作り直してください。', 'The link wasn’t found (it was deleted or lost). Please make a new one.') }
  if (!res.ok) return { ok: false, message: messageFor(res.status) }
  return { ok: true, value: { ...share, at: now.toISOString() } }
}

// リンクを消す。もう無いときも消せたことにする
export async function deleteShare(share: TierShare, fetchFn: typeof fetch = fetch): Promise<ShareResult<null>> {
  const res = await call({ query: `?id=${share.id}`, method: 'DELETE', headers: { Authorization: `Bearer ${share.key}` } }, fetchFn)
  if (!res) return { ok: false, message: offline() }
  if (!res.ok && res.status !== 404) return { ok: false, message: messageFor(res.status) }
  return { ok: true, value: null }
}

// 見る画面で、リンクの表を読む
export async function fetchShared(id: string, fetchFn: typeof fetch = fetch): Promise<ShareResult<SharedTable>> {
  const res = await call({ query: `?id=${id}`, method: 'GET' }, fetchFn)
  if (!res) return { ok: false, message: offline() }
  if (res.status === 404) return { ok: false, missing: true, message: t('この表は見つかりません。作った人が消したか、リンクが違います。', 'This tier list wasn’t found. It may have been deleted, or the link is wrong.') }
  if (!res.ok) return { ok: false, message: messageFor(res.status) }
  const body = (await res.json().catch(() => null)) as SharedTable | null
  if (!body || typeof body.title !== 'string' || !Array.isArray(body.tiers)) return { ok: false, message: messageFor(502) }
  const tiers = body.tiers.flatMap((x) =>
    x && typeof x.name === 'string' && Array.isArray(x.items) ? [{ name: x.name, items: x.items.filter((n): n is number => Number.isInteger(n) && n > 0) }] : [],
  )
  return { ok: true, value: { title: body.title, tiers } }
}
