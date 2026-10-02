import type { AniMedia } from '../../lib/anilist'
import { searchWorksByTitle, type WorkRef } from '../../lib/annict'

// AniList の作品から Annict の作品を特定する。Annict は MyAnimeList の ID で検索できないので、
// タイトルで検索して ID で照合する。表記の違いに備えて段階的に引き直す
// （2026-09-30 の実測: 131件中 そのまま106件・全角半角をそろえて16件・先頭の語で3件、外れ6件）

// \s は全角スペースにも当たる
const SEPARATORS = /[\s\-―:：!！?？~〜「『(（]/

export function titleVariants(title: AniMedia['title']): string[] {
  const out: string[] = []
  const add = (s: string | null | undefined) => {
    const v = s?.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  const native = title.native ?? ''
  const nfkc = native.normalize('NFKC')
  add(native)
  add(nfkc)
  const head = nfkc.split(SEPARATORS)[0]
  if (head.length >= 3) add(head)
  add(title.english)
  add(title.romaji)
  return out
}

export async function resolveAnnictWork(token: string, media: AniMedia): Promise<WorkRef | null> {
  const mal = String(media.idMal)
  for (const v of titleVariants(media.title)) {
    const hit = (await searchWorksByTitle(token, v)).find((w) => w.malAnimeId === mal)
    if (hit) return hit
  }
  return null
}
