import { expect, it } from 'vitest'
import type { BrowseWork } from '../../lib/annict'
import { sortByScore } from './browseSort'

function w(annictId: number, mal: number | null, watchers: number): BrowseWork {
  return {
    id: `W${annictId}`,
    annictId,
    title: `作品${annictId}`,
    media: 'TV',
    seasonYear: 2026,
    seasonName: 'SUMMER',
    malAnimeId: mal === null ? null : String(mal),
    watchersCount: watchers,
    viewerStatusState: null,
  }
}

it('orders by score, puts unscored works last, and breaks ties by watchers', () => {
  const works = [w(1, 101, 900), w(2, 102, 50), w(3, null, 5000), w(4, 104, 300), w(5, 105, 10), w(6, 106, 700), w(7, 107, 20)]
  const scores = new Map<number, number | null>([
    [101, 70],
    [102, 91],
    [104, 83],
    [105, null],
    [106, 83],
    // 107 は問い合わせても返ってこなかった
  ])
  expect(sortByScore(works, scores).map((x) => x.annictId)).toEqual([2, 6, 4, 1, 3, 7, 5])
})

it('does not change the input array', () => {
  const works = [w(1, 101, 1), w(2, 102, 2)]
  sortByScore(works, new Map([[102, 90]]))
  expect(works.map((x) => x.annictId)).toEqual([1, 2])
})
