import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'
import { linkWorks, resetAnnictLinksForTests } from './annictLinks'

function media(idMal: number): Media {
  return { idMal, title: { native: `作品${idMal}`, romaji: null, english: null } } as Media
}

function work(annictId: number, mal: number): BrowseWork {
  return { id: `W${annictId}`, annictId, title: `作品${mal}`, media: 'TV', seasonYear: 2024, seasonName: 'SPRING', malAnimeId: String(mal), watchersCount: 1, viewerStatusState: null }
}

// Annict の作品（Annict の ID → 作品）
const annict = new Map([
  [1, work(1, 101)],
  [2, work(2, 102)],
  [3, work(3, 103)],
])

function deps(found: Map<number, BrowseWork> = new Map()) {
  return {
    byIds: vi.fn(async (_t: string, ids: readonly number[]) => ids.flatMap((id) => annict.get(id) ?? [])),
    resolve: vi.fn(async (_t: string, medias: readonly Media[]) => new Map([...found].filter(([mal]) => medias.some((m) => m.idMal === mal)))),
    link: vi.fn(),
    now: () => 1_000,
  }
}

beforeEach(() => resetAnnictLinksForTests())

describe('linkWorks', () => {
  it('uses the relay’s pairs after checking them on Annict, without searching titles', async () => {
    const d = deps()
    const out = await linkWorks('t', [media(101), media(102)], new Map([[101, 1], [102, 2]]), d)
    expect([...out.keys()]).toEqual([101, 102])
    expect(d.byIds).toHaveBeenCalledTimes(1)
    expect(d.resolve).not.toHaveBeenCalled()
    expect(d.link).not.toHaveBeenCalled()
  })

  it('does not trust a wrong pair from the relay: searches by title and writes the right pair back', async () => {
    const d = deps(new Map([[101, work(1, 101)]]))
    // 中継は 101 → 3（MyAnimeList の ID が合わない）と言う
    const out = await linkWorks('t', [media(101)], new Map([[101, 3]]), d)
    expect(out.get(101)?.annictId).toBe(1)
    expect(d.resolve).toHaveBeenCalledTimes(1)
    expect(d.link).toHaveBeenCalledWith([[101, 1]])
  })

  it('searches unknown works by title, shares the found pairs, and remembers missing ones on this device for a while', async () => {
    const d = deps(new Map([[103, work(3, 103)]]))
    const out = await linkWorks('t', [media(103), media(999)], new Map(), d)
    expect([...out.keys()]).toEqual([103])
    expect(d.link).toHaveBeenCalledWith([[103, 3]])
    // 2回目: 103 はこの起動中に確かめた対応で引き、999 は「無い」と覚えているので題名で探さない
    const again = deps()
    const out2 = await linkWorks('t', [media(103), media(999)], new Map(), again)
    expect([...out2.keys()]).toEqual([103])
    expect(again.resolve).not.toHaveBeenCalled()
    // 7日たてば探し直す
    const later = { ...deps(), now: () => 1_000 + 8 * 86_400_000 }
    await linkWorks('t', [media(999)], new Map(), later)
    expect(later.resolve).toHaveBeenCalledTimes(1)
  })
})
