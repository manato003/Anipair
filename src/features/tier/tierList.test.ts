import { describe, expect, it } from 'vitest'
import type { LibraryEntry, MyReview, RatingState, StatusState } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'
import {
  TIER_MAX,
  TIER_MIN,
  addTier,
  candidates,
  addWorks,
  createPickedTable,
  createTable,
  exclude,
  insert,
  mergeTierStores,
  parseTable,
  parseTierStore,
  place,
  removeTier,
  renameTable,
  renameTier,
  periodScope,
  restorePlacement,
  removeWork,
  sameTierStores,
  serializeTierStore,
  settle,
  shift,
  tierForRating,
  viewOf,
  type TierTable,
  type TierWork,
} from './tierList'

function row(id: number, state: StatusState, rating: RatingState | null, opts: { at?: string; year?: number; season?: string; story?: RatingState } = {}): RecordRow {
  const entry: LibraryEntry = {
    workId: `W${id}`,
    annictId: id,
    title: `作品${id}`,
    malAnimeId: String(id + 1000),
    state,
    stateAt: opts.at ?? `2026-09-${String(id).padStart(2, '0')}T00:00:00Z`,
    seasonYear: opts.year ?? 2026,
    seasonName: opts.season ?? 'AUTUMN',
  }
  const review: MyReview | null =
    rating || opts.story
      ? { id: `R${id}`, body: '', createdAt: '', ratingOverallState: rating, ratingStoryState: opts.story ?? null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
      : null
  return { entry, review, cover: null }
}

const rows = [
  row(1, 'WATCHED', 'GREAT'),
  row(2, 'WATCHED', 'GOOD'),
  row(3, 'WATCHING', 'AVERAGE'),
  row(4, 'WATCHED', 'BAD', { story: 'GREAT' }),
  row(5, 'WATCHED', null),
  row(6, 'WANNA_WATCH', null),
  row(7, 'STOP_WATCHING', 'BAD'),
  row(8, 'WATCHED', 'GREAT', { season: 'SUMMER' }),
  row(9, 'WATCHED', 'GOOD', { year: 2025 }),
]

const now = new Date('2026-10-25T00:00:00Z')
const later = new Date('2026-10-26T00:00:00Z')
const autumn = { kind: 'cour', year: 2026, name: 'autumn' } as const

const make = (over: Partial<Parameters<typeof createTable>[1]> = {}): TierTable =>
  createTable(rows, { id: 't1', title: '2026年 秋', scope: autumn, includeDropped: false, ...over }, now)

describe('tierForRating', () => {
  it('4段階を段の数に均等に散らす', () => {
    expect((['GREAT', 'GOOD', 'AVERAGE', 'BAD'] as const).map((r) => tierForRating(r, 5))).toEqual([0, 1, 3, 4])
    expect((['GREAT', 'GOOD', 'AVERAGE', 'BAD'] as const).map((r) => tierForRating(r, 7))).toEqual([0, 2, 4, 6])
    expect((['GREAT', 'GOOD', 'AVERAGE', 'BAD'] as const).map((r) => tierForRating(r, 2))).toEqual([0, 0, 1, 1])
  })
})

describe('candidates', () => {
  it('範囲と状態で選び、その状態にした日の新しい順', () => {
    expect(candidates(rows, { scope: autumn, includeDropped: false }).map((r) => r.entry.annictId)).toEqual([5, 4, 3, 2, 1])
    expect(candidates(rows, { scope: autumn, includeDropped: true }).map((r) => r.entry.annictId)).toEqual([7, 5, 4, 3, 2, 1])
    expect(candidates(rows, { scope: { kind: 'year', year: 2026 }, includeDropped: false }).map((r) => r.entry.annictId)).toEqual([8, 5, 4, 3, 2, 1])
    expect(candidates(rows, { scope: { kind: 'all' }, includeDropped: false })).toHaveLength(7)
  })

  it('放送時期の分からない作品は、クールと年には入らない', () => {
    const r = row(10, 'WATCHED', 'GOOD')
    r.entry.seasonYear = null
    expect(candidates([r], { scope: { kind: 'year', year: 2026 }, includeDropped: false })).toEqual([])
    expect(candidates([r], { scope: { kind: 'all' }, includeDropped: false })).toHaveLength(1)
  })
})

describe('periodScope', () => {
  it('放送年の「から〜まで」と季節で選ぶ。年の片方が無ければ端まで、季節が空なら4つとも', () => {
    const ids = (scope: ReturnType<typeof periodScope>) => candidates(rows, { scope, includeDropped: false }).map((r) => r.entry.annictId)
    expect(ids(periodScope(2025, 2026, ['summer', 'autumn']))).toEqual([9, 8, 5, 4, 3, 2, 1])
    expect(ids(periodScope(2026, 2026, ['summer', 'autumn']))).toEqual([8, 5, 4, 3, 2, 1])
    expect(ids(periodScope(null, 2025, []))).toEqual([9])
    expect(ids(periodScope(2026, null, ['summer']))).toEqual([8])
  })

  it('年が逆なら入れ替え、1つのクール・1つの年・すべてになる期間はその形にする', () => {
    expect(periodScope(2026, 2024, ['autumn', 'spring'])).toEqual({ kind: 'period', from: 2024, to: 2026, seasons: ['spring', 'autumn'] })
    expect(periodScope(2026, 2026, ['autumn'])).toEqual(autumn)
    expect(periodScope(2026, 2026, [])).toEqual({ kind: 'year', year: 2026 })
    expect(periodScope(null, null, [])).toEqual({ kind: 'all' })
    expect(periodScope(null, null, ['spring'])).toEqual({ kind: 'period', from: null, to: null, seasons: ['spring'] })
  })

  it('保存した期間を読み直す。壊れた期間の表は捨てる', () => {
    const table = make({ scope: periodScope(2024, 2026, ['spring', 'summer']) })
    expect(parseTable(JSON.parse(JSON.stringify(table)))?.scope).toEqual({ kind: 'period', from: 2024, to: 2026, seasons: ['spring', 'summer'] })
    expect(parseTable({ ...table, scope: { kind: 'period', from: 2026, to: 2026, seasons: ['autumn'] } })?.scope).toEqual(autumn)
    expect(parseTable({ ...table, scope: { kind: 'period', from: 1800, to: null, seasons: [] } })).toBeNull()
    expect(parseTable({ ...table, scope: { kind: 'period', from: null, to: null, seasons: ['rainy'] } })).toBeNull()
  })
})

describe('選んだ表', () => {
  const work = (id: number, over: Partial<TierWork> = {}): TierWork => ({ annictId: id, workId: `W${id}`, title: `作品${id}`, malAnimeId: String(id + 1000), seasonYear: 2020, seasonName: 'SPRING', ...over })

  it('空で作り、足した作品は評価があっても「まだ置いていない」に入る。記録にある作品は記録の行を使う', () => {
    const empty = createPickedTable({ id: 'p1', title: 'すすめたい' }, now)
    expect(empty.tiers).toHaveLength(5)
    expect(viewOf(empty, rows).unplaced).toEqual([])
    const table = settle(addWorks(empty, [work(1), work(50), work(1)], later), rows, later)
    expect(table.works?.map((w) => w.annictId)).toEqual([1, 50])
    expect(table.updatedAt).toBe(later.toISOString())
    const view = viewOf(table, rows)
    expect(view.tiers.every((tier) => tier.rows.length === 0)).toBe(true)
    expect(view.unplaced.map((r) => r.entry.annictId)).toEqual([1, 50])
    expect(view.unplaced[0]).toBe(rows[0])
    expect(view.unplaced[1].entry).toMatchObject({ workId: 'W50', title: '作品50', state: 'NO_STATE', malAnimeId: '1050' })
    // 見た作品すべての表には、記録に無い作品は入らない
    expect(candidates([...rows, view.unplaced[1]], { scope: { kind: 'all' }, includeDropped: true }).some((r) => r.entry.annictId === 50)).toBe(false)
  })

  it('外すと、段・「表に入れない」のどこからも消える', () => {
    const table = place(exclude(addWorks(createPickedTable({ id: 'p1', title: '' }, now), [work(50), work(51)], now), 51, now), 50, 0, now)
    const out = removeWork(removeWork(table, 50, later), 51, later)
    expect(out.works).toEqual([])
    expect(out.tiers[0].items).toEqual([])
    expect(out).not.toHaveProperty('excluded')
    expect(removeWork(out, 99)).toBe(out)
  })

  it('保存した作品を読み直す。壊れた作品だけを捨てる', () => {
    const table = addWorks(createPickedTable({ id: 'p1', title: '入門' }, now), [work(50, { titleEn: 'Fifty', imageUrl: 'https://x.test/a.png' })], now)
    const back = parseTable(JSON.parse(JSON.stringify(table)))
    expect(back).toEqual(table)
    const broken = parseTable({ ...table, works: [...table.works!, { annictId: 51 }, { ...work(52), malAnimeId: 'abc', seasonName: 'rainy', imageUrl: 'http://x.test/b.png' }] })
    expect(broken?.works?.map((w) => [w.annictId, w.malAnimeId, w.seasonName, w.imageUrl])).toEqual([
      [50, '1050', 'SPRING', 'https://x.test/a.png'],
      [52, null, null, undefined],
    ])
  })
})

describe('createTable', () => {
  it('既定は5段で、Annict の評価で仮に置く。評価の無い作品は置かない', () => {
    const t = make()
    expect(t.tiers.map((x) => x.name)).toEqual(['S', 'A', 'B', 'C', 'D'])
    expect(t.tiers.map((x) => x.items)).toEqual([[1], [2], [], [3], [4]])
    expect(viewOf(t, rows).unplaced.map((r) => r.entry.annictId)).toEqual([5])
  })

  it('段の数は2〜10に収める', () => {
    expect(make({ count: 1 }).tiers).toHaveLength(TIER_MIN)
    expect(make({ count: 20 }).tiers).toHaveLength(TIER_MAX)
    expect(make({ count: 7 }).tiers.map((x) => x.items)).toEqual([[1], [], [2], [], [3], [], [4]])
  })

  it('4段は Annict の4段階そのまま、5段・6段は間に空の段をはさむ', () => {
    expect(make({ count: 4 }).tiers.map((x) => x.items)).toEqual([[1], [2], [3], [4]])
    expect(make({ count: 6 }).tiers.map((x) => x.items)).toEqual([[1], [], [2], [3], [], [4]])
  })

  it('全部自分で置く表は何も置かず、あとから評価した作品も自動で置かない。保存の形でも印が残る', () => {
    const t = make({ manual: true, count: 4 })
    expect(t.manual).toBe(true)
    expect(t.tiers.map((x) => x.items)).toEqual([[], [], [], []])
    expect(viewOf(t, rows).unplaced).toHaveLength(5)
    expect(settle(t, [...rows, row(11, 'WATCHED', 'GREAT')])).toBe(t)
    expect(parseTable(JSON.parse(JSON.stringify(t)))?.manual).toBe(true)
    expect(parseTable(JSON.parse(JSON.stringify(make())))).not.toHaveProperty('manual')
  })
})

describe('viewOf', () => {
  it('範囲から外れた作品は出さないが、表からは消さない', () => {
    const t = make()
    const changed = rows.map((r) => (r.entry.annictId === 1 ? { ...r, entry: { ...r.entry, state: 'WANNA_WATCH' as const } } : r))
    const v = viewOf(t, changed)
    expect(v.tiers[0].rows).toEqual([])
    expect(t.tiers[0].items).toEqual([1])
    expect(viewOf(t, rows).tiers[0].rows.map((r) => r.entry.annictId)).toEqual([1])
  })

  it('新しく範囲に入った作品は「まだ置いていない」に出る', () => {
    const t = make()
    const v = viewOf(t, [...rows, row(11, 'WATCHED', 'GREAT')])
    expect(v.unplaced.map((r) => r.entry.annictId)).toEqual([11, 5])
  })
})

describe('settle', () => {
  it('あとから見た・評価した作品を評価どおりの段の最後へ置く。評価の無い作品と自分で外した作品は置かない', () => {
    const t = place(make(), 2, null)
    const more = [...rows, row(11, 'WATCHED', 'GREAT'), row(12, 'WATCHED', null), row(13, 'WATCHED', 'BAD')]
    const s = settle(t, more, later)
    expect(s.tiers.map((x) => x.items)).toEqual([[1, 11], [], [], [3], [4, 13]])
    expect(s.updatedAt).toBe(later.toISOString())
    expect(viewOf(s, more).unplaced.map((r) => r.entry.annictId)).toEqual([12, 5, 2])
  })

  it('置くものが無ければ同じ表を返す', () => {
    const t = make()
    expect(settle(t, rows)).toBe(t)
  })
})

describe('並べ替え', () => {
  it('段に置くと最後に入り、前の段からは外れる。null で戻す', () => {
    let t = place(make(), 5, 0, later)
    expect(t.tiers[0].items).toEqual([1, 5])
    expect(t.updatedAt).toBe(later.toISOString())
    t = place(t, 1, 2, later)
    expect(t.tiers.map((x) => x.items)).toEqual([[5], [2], [1], [3], [4]])
    t = place(t, 1, null, later)
    expect(t.tiers[2].items).toEqual([])
  })

  it('指定した作品の前に入れる。同じ段の中でも動かせ、見つからなければ最後', () => {
    let t = place(place(make(), 5, 0), 2, 0)
    expect(t.tiers[0].items).toEqual([1, 5, 2])
    t = insert(t, 2, 0, 1, later)
    expect(t.tiers[0].items).toEqual([2, 1, 5])
    t = insert(t, 5, 0, 1)
    expect(t.tiers[0].items).toEqual([2, 5, 1])
    t = insert(t, 3, 0, 999)
    expect(t.tiers[0].items).toEqual([2, 5, 1, 3])
    expect(t.tiers[2].items).toEqual([])
  })

  it('「まだ置いていない」へ戻した作品を控え、段に置き直すと控えから外す', () => {
    let t = place(make(), 1, null)
    expect(t.held).toEqual([1])
    t = insert(t, 1, 1, null)
    expect(t.held).toBeUndefined()
    expect(t.tiers[1].items).toEqual([2, 1])
  })

  it('「ひとつ戻る」は段の並びと控えだけを前の表に戻し、日時は新しくする', () => {
    const before = place(make(), 1, null)
    const shared = { ...before, share: { id: 's1', key: 'k', at: later.toISOString() } }
    const after = place(shared, 1, 0)
    const back = restorePlacement(after, before, later)
    expect(back.tiers).toEqual(before.tiers)
    expect(back.held).toEqual([1])
    expect(back.share).toEqual(shared.share)
    expect(back.updatedAt).toBe(later.toISOString())
    expect(restorePlacement(place(make(), 5, 0), make(), later).held).toBeUndefined()
  })

  it('「表に入れない」と段からも「まだ置いていない」からも外れ、評価があっても自動で置き直さない', () => {
    let t = exclude(place(make(), 2, null), 2, later)
    t = exclude(t, 5, later)
    expect(t.tiers.map((x) => x.items)).toEqual([[1], [], [], [3], [4]])
    expect(t.held).toBeUndefined()
    expect(t.excluded).toEqual([2, 5])
    expect(t.updatedAt).toBe(later.toISOString())
    const v = viewOf(settle(t, rows), rows)
    expect(v.unplaced).toEqual([])
    expect(v.excluded.map((r) => r.entry.annictId)).toEqual([5, 2])
  })

  it('「表に入れない」から戻すと「まだ置いていない」へ、段に置けば段へ入る', () => {
    const t = exclude(exclude(make(), 2), 5)
    const back = place(t, 2, null)
    expect(back.excluded).toEqual([5])
    expect(back.held).toEqual([2])
    const placed = insert(back, 5, 0, null)
    expect(placed).not.toHaveProperty('excluded')
    expect(placed.tiers[0].items).toEqual([1, 5])
  })

  it('「ひとつ戻る」は「表に入れない」も前の表に戻す', () => {
    const before = make()
    const back = restorePlacement(exclude(before, 1), before, later)
    expect(back.tiers).toEqual(before.tiers)
    expect(back).not.toHaveProperty('excluded')
    expect(restorePlacement(before, exclude(before, 1), later).excluded).toEqual([1])
  })

  it('段の中で隣と入れ替える。画面に出ていない作品は飛ばす', () => {
    let t = place(place(make(), 5, 0), 9, 0)
    expect(t.tiers[0].items).toEqual([1, 5, 9])
    // 9 は範囲の外（2025年）なので画面には 1, 5 だけ
    t = shift(t, 1, 1, [1, 5])
    expect(t.tiers[0].items).toEqual([5, 1, 9])
    expect(shift(t, 1, 1, [5, 1])).toBe(t)
    expect(shift(t, 5, -1, [5, 1])).toBe(t)
  })

  it('段を足すと下に増え、減らすと下の段の作品は「まだ置いていない」へ', () => {
    let t = addTier(make(), later)
    expect(t.tiers.map((x) => x.name)).toEqual(['S', 'A', 'B', 'C', 'D', 'E'])
    t = removeTier(removeTier(t))
    expect(t.tiers).toHaveLength(4)
    expect(viewOf(t, rows).unplaced.map((r) => r.entry.annictId)).toEqual([5, 4])
    // 減らして戻った作品は、評価があっても自動では置き直さない
    expect(t.held).toEqual([4])
    expect(settle(t, rows)).toBe(t)
    let small = make({ count: 2 })
    small = removeTier(small)
    expect(small.tiers).toHaveLength(2)
    let big = make({ count: 10 })
    big = addTier(big)
    expect(big.tiers).toHaveLength(10)
  })

  it('段の名前と題名は前後の空白を外して上限で切り、空なら元に戻す', () => {
    let t = renameTier(make(), 0, '  神  ')
    expect(t.tiers[0].name).toBe('神')
    t = renameTier(t, 1, '')
    expect(t.tiers[1].name).toBe('A')
    t = renameTier(t, 2, 'あ'.repeat(30))
    expect(t.tiers[2].name).toBe('あ'.repeat(12))
    expect(renameTable(t, '  ').title).toBe('2026年 秋')
    expect(renameTable(t, '今期のTier').title).toBe('今期のTier')
  })
})

describe('保存の形', () => {
  it('書き出して読み直すと同じ', () => {
    const store = { tables: [make()], removed: [{ id: 'old', at: now.toISOString() }] }
    const back = parseTierStore(JSON.parse(JSON.stringify(serializeTierStore(store))))
    expect(sameTierStores(back, store)).toBe(true)
  })

  it('壊れた表だけを捨て、壊れた作品の ID と重なりを外す', () => {
    const good = make()
    const store = parseTierStore({
      tables: [good, { id: 'x' }, { ...good, id: 'bad id!' }, { ...good, id: 't2', tiers: [{ name: 'S', items: [1, 'a', -2, 1] }, { name: '', items: [1, 3] }] }],
      removed: [{ id: 'r', at: 'nope' }],
    })
    expect(store.tables.map((t) => t.id)).toEqual(['t1', 't2'])
    expect(store.tables[1].tiers).toEqual([
      { name: 'S', items: [1] },
      { name: 'A', items: [3] },
    ])
    expect(store.removed).toEqual([])
    expect(parseTable({ ...good, tiers: [{ name: 'S', items: [] }] })).toBeNull()
    // 外した作品の控えは、段にある作品と重ならないものだけ
    expect(parseTable({ ...good, held: [1, 5, 5, 'x', 0] })?.held).toEqual([5])
    expect(parseTable({ ...good, held: [1] })).not.toHaveProperty('held')
    // 「表に入れない」も同じ。段・控えと重なる作品は外す
    expect(parseTable({ ...good, held: [5], excluded: [1, 5, 6, 6, 'x'] })?.excluded).toEqual([6])
    expect(parseTable({ ...good, excluded: [] })).not.toHaveProperty('excluded')
    expect(parseTable({ ...good, scope: { kind: 'cour', year: 2026, name: 'rainy' } })).toBeNull()
    expect(parseTierStore('oops')).toEqual({ tables: [], removed: [] })
  })

  it('合わせると、同じ表は新しく変えた方を採り、消した印より古い表は消す', () => {
    const a = make()
    const b = renameTable(a, '新しい題名', later)
    const c = { ...make({ id: 't2' }), updatedAt: now.toISOString() }
    const merged = mergeTierStores({ tables: [a, c], removed: [] }, { tables: [b], removed: [{ id: 't2', at: later.toISOString() }] })
    expect(merged.tables.map((t) => [t.id, t.title])).toEqual([['t1', '新しい題名']])
    expect(merged.removed).toEqual([{ id: 't2', at: later.toISOString() }])
    // 消したあとに別の端末で変えた表は残す
    const revived = { ...c, updatedAt: '2026-10-27T00:00:00Z' }
    expect(mergeTierStores({ tables: [revived], removed: [] }, merged).tables.map((t) => t.id)).toEqual(['t2', 't1'])
  })
})
