import { describe, expect, it } from 'vitest'
import { aboutLeft, answerCompare, applyCompare, nextPair, resetCompare, startCompare, type CompareState } from './tierRanking'
import { createPickedTable, type TierTable } from './tierList'

// 正しい順（truth の前ほど上）を知っている人として最後まで答える。答えた回数も返す
function sortBy(s: CompareState, truth: readonly number[]): { state: CompareState; asked: number } {
  let asked = 0
  for (let pair = nextPair(s); pair; pair = nextPair(s)) {
    s = answerCompare(s, truth.indexOf(pair.candidate) < truth.indexOf(pair.against))
    asked++
  }
  return { state: s, asked }
}

function shuffled(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i + 1)
  let x = seed
  for (let i = n - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648
    const j = x % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function table(items: number[], ranked?: number[]): TierTable {
  const base = createPickedTable({ id: 't1', title: '表', count: 3 }, new Date('2026-11-01T00:00:00Z'))
  return { ...base, tiers: base.tiers.map((t, i) => (i === 0 ? { ...t, items, ...(ranked ? { ranked } : {}) } : t)) }
}

describe('startCompare・answerCompare', () => {
  it('どんな並びからでも、答えどおりの順になる', () => {
    for (const n of [2, 3, 5, 10, 20]) {
      for (let seed = 1; seed <= 20; seed++) {
        const truth = shuffled(n, seed + 100)
        expect(sortBy(startCompare(shuffled(n, seed), []), truth).state.ranked).toEqual(truth)
      }
    }
  })

  it('今の並びが合っていれば、1本につき1回で済む', () => {
    const visible = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(sortBy(startCompare(visible, []), visible).asked).toBe(19)
    expect(sortBy(startCompare(visible, []), [...visible].reverse()).asked).toBe(19)
  })

  it('1本だけ高すぎる並びでは、ほかの作品の回数が増えない', () => {
    const truth = Array.from({ length: 20 }, (_, i) => i + 1)
    const visible = [1, 20, ...truth.slice(1, 19)]
    expect(sortBy(startCompare(visible, []), truth).asked).toBeLessThanOrEqual(45)
  })

  it('ばらばらの並びでは、真ん中から聞くのに切り替えて、二分だけの平均から大きく増えない', () => {
    let asked = 0
    for (let seed = 1; seed <= 200; seed++) asked += sortBy(startCompare(shuffled(20, seed), []), shuffled(20, seed + 1000)).asked
    expect(asked / 200).toBeLessThan(66)
  })

  it('外れが続くと最初の問いを真ん中の作品にし、当たりだすと今の並びの確かめに戻す', () => {
    const base: CompareState = { ranked: [1, 2, 3, 4, 5], rest: [6, 7], lo: 0, hi: 5, anchor: 5, missed: [true, true, true, false], asked: 0, narrowed: 0 }
    expect(nextPair(base)?.against).toBe(3)
    expect(nextPair({ ...base, missed: [true, true, false, false] })?.against).toBe(5)
    // 真ん中から聞いている間も当たりを数える。5 の下に入ると1本分の外れが抜ける
    const next = answerCompare(answerCompare(base, false), false)
    expect(next.ranked).toEqual([1, 2, 3, 4, 5, 6])
    expect(next.missed).toEqual([true, true, true, false, false])
    expect(nextPair(next)).toEqual({ candidate: 7, against: 6 })
  })

  it('入れた先が1つ前の作品のすぐ下から1本までなら、当たりと数える', () => {
    const s: CompareState = { ranked: [1, 2, 3, 4, 5], rest: [6, 7], lo: 0, hi: 5, anchor: 2, missed: [], asked: 0, narrowed: 0 }
    expect(answerCompare({ ...s, lo: 2, hi: 3 }, true).missed).toEqual([false])
    expect(answerCompare({ ...s, lo: 3, hi: 4 }, true).missed).toEqual([false])
    expect(answerCompare({ ...s, lo: 4, hi: 5 }, true).missed).toEqual([true])
  })

  it('比べて決めた作品はそのままの順で、まだの作品だけを入れる', () => {
    const s = startCompare([3, 1, 4, 2], [1, 2])
    expect(s.ranked).toEqual([1, 2])
    expect(s.rest).toEqual([3, 4])
    expect(sortBy(s, [3, 1, 4, 2]).state.ranked).toEqual([3, 1, 4, 2])
  })

  it('1本だけなら比べるものが無い', () => {
    expect(nextPair(startCompare([7], []))).toBeNull()
    expect(nextPair(startCompare([], []))).toBeNull()
    expect(aboutLeft(startCompare([7, 8], [7, 8]))).toBe(0)
  })
})

describe('aboutLeft', () => {
  // 答えるたびの見積もりと、実際に残っていた回数
  function trace(s: CompareState, truth: readonly number[]): { about: number; actual: number }[] {
    const about: number[] = []
    for (let pair = nextPair(s); pair; pair = nextPair(s)) {
      about.push(aboutLeft(s))
      s = answerCompare(s, truth.indexOf(pair.candidate) < truth.indexOf(pair.against))
    }
    return about.map((a, i) => ({ about: a, actual: about.length - i }))
  }

  it('最初は二分で探す平均の回数を出す', () => {
    expect(aboutLeft(startCompare(shuffled(10, 1), []))).toBe(22)
    expect(aboutLeft(startCompare(shuffled(20, 1), []))).toBe(61)
  })

  it('並びが合っていれば、答えるたびに減り、実際の回数を下回らない', () => {
    const visible = Array.from({ length: 20 }, (_, i) => i + 1)
    const steps = trace(startCompare(visible, []), visible)
    steps.forEach(({ about, actual }) => expect(about).toBeGreaterThanOrEqual(actual))
    steps.slice(1).forEach((step, i) => expect(step.about).toBeLessThanOrEqual(steps[i].about))
  })

  it('ばらばらでも、見積もりは実際から大きく外れず、答えて増えても少しだけ', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const steps = trace(startCompare(shuffled(20, seed), []), shuffled(20, seed + 1000))
      expect(Math.abs(steps[0].about - steps[0].actual)).toBeLessThanOrEqual(12)
      steps.slice(1).forEach((step, i) => expect(step.about - steps[i].about).toBeLessThanOrEqual(5))
    }
  })

  it('残っている間は1回以上', () => {
    const s = startCompare([1, 2], [])
    expect(aboutLeft(s)).toBe(1)
    expect(aboutLeft(answerCompare(s, true))).toBe(0)
  })
})

describe('applyCompare', () => {
  it('比べ終えた作品を前に、まだの作品を元の順で後ろに、画面に出ていない作品を最後に置く', () => {
    // 9 は範囲の外（画面に出ていない）
    const t = table([1, 9, 2, 3, 4])
    let s = startCompare([1, 2, 3, 4], [])
    s = answerCompare(s, true) // 2 を 1 の上に
    const next = applyCompare(t, 0, s, new Date('2026-11-02T00:00:00Z'))
    expect(next.tiers[0].items).toEqual([2, 1, 3, 4, 9])
    expect(next.tiers[0].ranked).toEqual([2, 1])
    expect(next.tiers[1]).toBe(t.tiers[1])
    expect(next.updatedAt).toBe('2026-11-02T00:00:00.000Z')
  })

  it('比べている間に段から抜けた作品は書かない', () => {
    const t = table([1, 3])
    const s: CompareState = { ranked: [2, 1], rest: [3], lo: 0, hi: 2, anchor: 1, missed: [], asked: 0, narrowed: 0 }
    expect(applyCompare(t, 0, s).tiers[0]).toEqual({ name: 'S', items: [1, 3], ranked: [1] })
  })

  it('書いた表から始め直すと、続きから比べる', () => {
    let s = startCompare([1, 2, 3], [])
    s = answerCompare(s, false) // 2 は 1 の下
    const t = applyCompare(table([1, 2, 3]), 0, s)
    const again = startCompare(t.tiers[0].items, t.tiers[0].ranked ?? [])
    expect(again.ranked).toEqual([1, 2])
    expect(again.rest).toEqual([3])
  })
})

describe('resetCompare', () => {
  it('並びはそのままで、印だけを外す', () => {
    const t = table([2, 1], [2, 1])
    const next = resetCompare(t, 0)
    expect(next.tiers[0]).toEqual({ name: 'S', items: [2, 1] })
    expect(resetCompare(next, 0)).toBe(next)
  })
})
