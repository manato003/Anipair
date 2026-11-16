// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnnictWork, MyReview, ReviewAxes } from '../../lib/annict'
import type { GithubConnection } from '../../lib/github'
import { previousSeason, seasonOf, toSlug } from '../../lib/season'
import { loadWriteJournalRaw, saveAnnictToken } from '../../lib/storage'
import { LEGACY_AT, type Unseen } from './unseen'

const calls: string[] = []
// 共有の感想の控えへの出し入れ（送信の順番とは別に見る）
const remembered: string[] = []
let reviewSeq = 0
// 立てると、同期がこの Promise の解決まで止まる（同期の最中の変更を試すため）
let syncGate: Promise<void> | null = null
let syncResult: Unseen | Error | null = null
let emptySlugs = new Set<string>()
// 共有の感想の控えにすでにある感想（別の端末で評価した作品）
let existingReviews = new Map<number, MyReview>()
// Annict の今の状態（別の端末で記録した作品。無ければ未記録）
let statusNow = new Map<string, 'WATCHING' | 'WATCHED'>()

const works: AnnictWork[] = [1, 2, 3].map((n) => ({
  id: `W${n}`,
  annictId: n,
  title: `作品${n}`,
  media: 'TV',
  malAnimeId: String(1000 + n),
  watchersCount: 100,
  viewerStatusState: 'NO_STATE',
  imageUrl: null,
}))

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchSeasonWorks: vi.fn(async (_t: string, slug: string) => (emptySlugs.has(slug) ? [] : works)),
  updateStatus: vi.fn(async (_t: string, id: string, state: string) => void calls.push(`status ${id} ${state}`)),
  fetchWorkStatus: vi.fn(async (_t: string, id: string) => {
    calls.push(`read ${id}`)
    return statusNow.get(id) ?? 'NO_STATE'
  }),
  deleteReview: vi.fn(async (_t: string, rid: string) => void calls.push(`delete ${rid}`)),
  // 評価はすべて共有の手順（lib/reviewOps.ts の changeRating）を通る。送る直前に控えの感想を読み直す
  fetchReview: vi.fn(async (_t: string, id: string) => [...existingReviews.values()].find((r) => r.id === id) ?? null),
  createReviewWith: vi.fn(async (_t: string, id: string, axes: ReviewAxes) => {
    const rid = `R${++reviewSeq}`
    calls.push(`review ${id} ${axes.ratingOverallState} -> ${rid}`)
    return rid
  }),
}))

vi.mock('../../lib/covers', async (orig) => ({ ...(await orig<typeof import('../../lib/covers')>()), fetchCovers: vi.fn(async () => new Map()) }))
// 共有の感想の控えの代わり。作った・付け直した感想を覚え、取り消しで消す
vi.mock('../../lib/myReviews', () => ({
  getMyReviews: vi.fn(async () => existingReviews),
  peekMyReview: vi.fn((_t: string, id: number) => existingReviews.get(id) ?? null),
  rememberReview: vi.fn(async (_t: string, id: number, r: MyReview | null) => {
    remembered.push(r ? `${id} ${r.id} ${r.ratingOverallState}` : `${id} null`)
    if (r) existingReviews.set(id, r)
    else existingReviews.delete(id)
  }),
}))
// 同期の相手（GitHub）は偽物。同期が呼ばれたことと、返す内容を操作できるようにする
vi.mock('./unseenStore', async (orig) => ({
  ...(await orig<typeof import('./unseenStore')>()),
  syncUnseen: vi.fn(async () => {
    calls.push('sync')
    await syncGate
    if (syncResult instanceof Error) throw syncResult
    return syncResult ?? new Map()
  }),
}))

const { useBackfill } = await import('./useBackfill')
const { syncUnseen } = await import('./unseenStore')
const { deleteReview, updateStatus } = await import('../../lib/annict')

const GH = { token: 'gh', repo: 'me/anipair-data' }

async function setup(github: GithubConnection | null = null) {
  const hook = renderHook(() => useBackfill('token', github))
  await waitFor(() => expect(hook.result.current.current).not.toBeNull())
  return hook
}

async function settle(hook: Awaited<ReturnType<typeof setup>>) {
  await waitFor(() => expect(hook.result.current.pending).toBe(0))
}

beforeEach(() => {
  existingReviews = new Map()
  statusNow = new Map()
  localStorage.clear()
  calls.length = 0
  remembered.length = 0
  reviewSeq = 0
  syncGate = null
  syncResult = null
  emptySlugs = new Set()
  localStorage.clear()
})

describe('useBackfill', () => {
  it('rating marks the work watched, then posts the overall rating, and moves to the next card at once', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1'])
  })

  it('drops a work recorded from a related-work sheet out of the cards still to come, keeping the current one', async () => {
    const hook = await setup()
    expect(hook.result.current.progress).toEqual({ answered: 0, total: 3 })
    // 今の1枚（W1）は残す
    act(() => hook.result.current.dropFromDeck(1, true))
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W2', 'W3'])
    // これから出てくる W3 は外す。答えた数に入る
    act(() => hook.result.current.dropFromDeck(3, true))
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W2'])
    expect(hook.result.current.progress).toEqual({ answered: 1, total: 3 })
    // 山に無い作品は何もしない
    act(() => hook.result.current.dropFromDeck(99, true))
    expect(hook.result.current.cards).toHaveLength(2)
  })

  it('undoing a rating deletes that review and clears the status', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1', 'delete R1', 'status W1 NO_STATE'])
  })

  it('does not make a second review when the work already has one (rated on another device), and undo puts the earlier rating back', async () => {
    existingReviews = new Map([
      [1, { id: 'OLD', body: '', createdAt: '2026-10-01T00:00:00Z', ratingOverallState: 'AVERAGE', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }],
    ])
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await settle(hook)
    // 総合だけの感想は「作ってから古いものを消す」で付け直す（新しく2つ目は作らない）
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1', 'delete OLD'])
  })

  it('"watched but forgotten" sets the status without a review', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watched' }))
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'status W1 NO_STATE'])
  })

  // 2026-11-12 の通しレビュー N4: 送る前に取り消したら、何も書かない・控えにも残さない
  // （控えに「未設定」を残すと、別の端末で記録済みの作品を、開き直したあとの送り直しで外してしまう）
  it('undoing before the answer was sent cancels it: nothing is written and nothing is left in the journal', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watched' }))
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual([])
    expect(loadWriteJournalRaw()).toBeNull()
  })

  // 2026-11-13 のレビュー O1: もう一度答えたとき、送信中の取り消しは「頼み直された」扱いになる。その答えを送る前に取り消すと、
  // 先の取り消しが失敗しても一覧にも控えにも残らず、Annict に最初の答えが残っていた。取りやめるときに、先の取り消しを頼み直す
  it('undoing an unsent answer asks again for the undo it had replaced, so the first answer does not stay on Annict when that undo fails', async () => {
    saveAnnictToken('token')
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1'])
    // 取り消しの最初の書き込み（感想を消す）が、送信中のまま止まって、あとで失敗する
    let fail: (() => void) | undefined
    vi.mocked(deleteReview).mockImplementationOnce(() => new Promise<never>((_, reject) => (fail = () => reject(new Error('HTTP 502')))))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(fail).toBeDefined())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    await act(async () => fail!())
    await settle(hook)
    // もう一度の答えは何も書かない。先の取り消しの行き先（未設定・評価なし）は、頼み直した分が書く
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1', 'status W1 NO_STATE', 'delete R1'])
    expect(hook.result.current.failed).toEqual([])
    expect(loadWriteJournalRaw()).toBeNull()
  })

  // 答えのあとで、同じ作品をほかの画面（関連作品のシートなど）から書いていても、送っていない答えの取り消しは何も書かない（あとの書き込みを「未設定」で消さない）
  it('undoing an unsent answer writes nothing, and leaves alone a write made to the same work from elsewhere after the answer', async () => {
    const hook = await setup()
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    act(() => {
      hook.result.current.enqueue('前の送信', () => gate)
      hook.result.current.answer({ kind: 'watched' })
    })
    act(() => void hook.result.current.enqueue('ほかの画面', async () => void calls.push('elsewhere'), [{ kind: 'status', workId: 'W1', state: 'WATCHING', idMal: 1001 }]))
    act(() => hook.result.current.undo())
    release()
    await settle(hook)
    expect(calls).toEqual(['elsewhere'])
    expect(loadWriteJournalRaw()).toBeNull()
  })

  // 2026-11-13 のレビュー O4: 取り消しが失敗したあとでもう一度答えると、書く前の評価として、消えなかった最初の評価を読んでいた。
  // その答えを取り消すと最初の評価へ戻し、Annict に感想が残った。届いていない取り消しの行き先（評価なし）へ戻す
  it('undoing a second answer goes back to where the failed undo of the first was heading, not to the first answer', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    vi.mocked(deleteReview).mockRejectedValueOnce(new Error('HTTP 502'))
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(hook.result.current.failed.map((f) => f.label)).toEqual(['「作品1」の取り消し'])
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GOOD -> R1'])
    // もう一度答える（先の失敗は一覧から外れる）。Annict には最初の評価が残っている
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(hook.result.current.failed).toEqual([])
    await settle(hook)
    expect(calls.slice(2)).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R2', 'delete R1'])
    act(() => hook.result.current.undo())
    await settle(hook)
    // 最初の評価（GOOD）を付け直さず、感想を消して「未設定」に戻す
    expect(calls.slice(5)).toEqual(['delete R2', 'status W1 NO_STATE'])
    expect(remembered.at(-1)).toBe('1 null')
    expect(hook.result.current.failed).toEqual([])
    expect(loadWriteJournalRaw()).toBeNull()
  })

  // 先の取り消しが届いていれば、書く前の値は今までどおり送るときに読む（あいだにほかの端末で付けた評価へ戻せる）
  it('undoing a second answer goes back to what was read when it was sent, once the undo of the first has arrived', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    act(() => hook.result.current.undo())
    await settle(hook)
    // 取り消しが届いたあと、ほかの画面で評価を付けた
    existingReviews.set(1, { id: 'ELSE', body: '', createdAt: '2026-10-01T00:00:00Z', ratingOverallState: 'AVERAGE', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null })
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await settle(hook)
    calls.length = 0
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['review W1 AVERAGE -> R3', 'delete R2', 'status W1 NO_STATE'])
  })

  // 2026-11-16 のレビュー Q1: 評価 → 取り消し → すぐもう一度評価、のとき、答えたときの控えには先の評価がまだ残っている（取り消しが送信中）。
  // それを「付ける前の評価の見立て」として取り消しの行き先に書いていたので、行き先が頼み直されると、取り消したはずの最初の評価が Annict に付いた
  it('rating, undoing and rating again three times in a row leaves no rating behind', async () => {
    saveAnnictToken('token')
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    // 1回目の取り消しが送信中のうちに、もう一度答える
    let arrive1: (() => void) | undefined
    vi.mocked(deleteReview).mockImplementationOnce(() => new Promise<void>((resolve) => (arrive1 = resolve)))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(arrive1).toBeDefined())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await act(async () => arrive1!())
    await settle(hook)
    // 2回目の取り消しも送信中のうちに、3回目に答えて、送る前に取り消す（2回目の取り消しの行き先が頼み直される）
    let arrive2: (() => void) | undefined
    vi.mocked(deleteReview).mockImplementationOnce(() => new Promise<void>((resolve) => (arrive2 = resolve)))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(arrive2).toBeDefined())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'AVERAGE' }))
    act(() => hook.result.current.undo())
    calls.length = 0
    await act(async () => arrive2!())
    await settle(hook)
    // 頼み直した分は「未設定・評価なし」を書くだけで、感想を作らない
    expect(calls).toEqual(['status W1 NO_STATE', 'status W1 NO_STATE'])
    expect(existingReviews.size).toBe(0)
    expect(hook.result.current.failed).toEqual([])
    expect(loadWriteJournalRaw()).toBeNull()
  })

  // 答えの送信が評価を読むところまで進む前に取り消しても、控えに書く見立ては、送り始めたときの控えから取る（答えたときの古い評価にしない）
  it('the undo of an answer still on its way notes "no rating" as where to go back, not the rating an earlier undo has removed', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    await settle(hook)
    let arrive1: (() => void) | undefined
    vi.mocked(deleteReview).mockImplementationOnce(() => new Promise<void>((resolve) => (arrive1 = resolve)))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(arrive1).toBeDefined())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    // 1回目の取り消しの状態の書き込みはそのまま通し、2回目の答えの状態の書き込みを送信中で止める
    let arrive2: (() => void) | undefined
    vi.mocked(updateStatus)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(() => new Promise<void>((resolve) => (arrive2 = resolve)))
    await act(async () => arrive1!())
    await waitFor(() => expect(arrive2).toBeDefined())
    act(() => hook.result.current.undo())
    const noted = (loadWriteJournalRaw() as { entries: { label: string; intent: { kind: string; rating?: string | null } }[] }).entries
    expect(noted.filter((e) => e.intent.kind === 'rating').map((e) => [e.label, e.intent.rating])).toEqual([['「作品1」の取り消し', null]])
    await act(async () => arrive2!())
    await settle(hook)
    expect(existingReviews.size).toBe(0)
    expect(loadWriteJournalRaw()).toBeNull()
  })

  it('"want to watch" sets WANNA_WATCH without a review, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WANNA_WATCH', 'status W1 NO_STATE'])
  })

  it('"not watched" is kept on this device without a GitHub token, and never calls Annict', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['1']).toMatchObject({ active: true })
    act(() => hook.result.current.undo())
    // 取り消しは項目を消さずに active: false で残す
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['1']).toMatchObject({ active: false })
    await settle(hook)
    expect(calls).toEqual([])
  })

  it('"dropped" sets STOP_WATCHING without a review, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'stop' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 STOP_WATCHING', 'status W1 NO_STATE'])
  })

  it('"watching" sets WATCHING, and undo clears it', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watching' }))
    expect(hook.result.current.current?.work.id).toBe('W2')
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHING', 'status W1 NO_STATE'])
  })

  // 2026-10-06 の点検: 古いクールの作品に「見てる」と答えると、次に開いたとき（タブに戻ったとき）すぐ「見終わりましたか」と聞いていた
  it('"watching" is not asked about again until the cour ends, like 「まだ見てる」; undo takes that back', async () => {
    const { snoozedWatching } = await import('./stillWatching')
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'watching' }))
    expect(snoozedWatching().has(1)).toBe(true)
    act(() => hook.result.current.undo())
    expect(snoozedWatching().has(1)).toBe(false)
    await settle(hook)
  })

  // 2026-10-06 の点検: 答えている途中で GitHub とつなぐと、山を読み直して位置がずれていた（空なら前のクールへ飛んでいた）
  it('connecting GitHub on the way syncs "not watched" only, and keeps the cards and the position', async () => {
    const { fetchSeasonWorks } = await import('../../lib/annict')
    const hook = renderHook(({ gh }) => useBackfill('token', gh), { initialProps: { gh: null as GithubConnection | null } })
    await waitFor(() => expect(hook.result.current.current).not.toBeNull())
    act(() => hook.result.current.answer({ kind: 'skip' }))
    const reads = vi.mocked(fetchSeasonWorks).mock.calls.length
    hook.rerender({ gh: GH })
    await waitFor(() => expect(calls).toContain('sync'))
    expect(vi.mocked(fetchSeasonWorks).mock.calls.length).toBe(reads)
    expect(hook.result.current.current?.work.id).toBe('W2')
  })

  it('puts a created review in the shared cache, and takes it out again on undo', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls).toEqual(['status W1 WATCHED', 'review W1 GREAT -> R1', 'delete R1', 'status W1 NO_STATE'])
    expect(remembered).toEqual(['1 R1 GREAT', '1 null'])
  })

  it('syncs "not watched" with GitHub once when the deck loads, and drops what other devices marked', async () => {
    syncResult = new Map([[2, { at: '2026-09-29T00:00:00.000Z', active: true }]])
    const hook = await setup(GH)
    expect(calls).toEqual(['sync'])
    expect(syncUnseen).toHaveBeenCalledWith(GH)
    expect(hook.result.current.cards!.map((c) => c.work.id)).toEqual(['W1', 'W3'])
    expect(hook.result.current.syncNote).toBeNull()
  })

  it('carries on with the local records and says so when the sync fails', async () => {
    syncResult = new Error('offline')
    const hook = await setup(GH)
    expect(hook.result.current.cards).toHaveLength(3)
    expect(hook.result.current.syncNote).toContain('offline')
  })

  it('syncs once for several "not watched" answers in a row, and once more for a change made during a running sync', async () => {
    const hook = await setup(GH)
    calls.length = 0
    let release = () => {}
    syncGate = new Promise<void>((r) => (release = r))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.undo())
    await waitFor(() => expect(calls).toEqual(['sync']))
    act(() => hook.result.current.undo())
    release()
    await settle(hook)
    expect(calls).toEqual(['sync', 'sync'])
  })

  it('moves the old device-only list into the new records once, then removes the old key', async () => {
    localStorage.setItem('animax.backfill.skipped', JSON.stringify([2]))
    const hook = await setup()
    expect(hook.result.current.cards!.map((c) => c.work.id)).toEqual(['W1', 'W3'])
    expect(localStorage.getItem('animax.backfill.skipped')).toBeNull()
    expect(JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen['2']).toEqual({ at: LEGACY_AT, active: true })
  })

  it('stepping forward into a season with nothing left shows it as done instead of bouncing back', async () => {
    const now = seasonOf(new Date())
    const before = previousSeason(now)
    localStorage.setItem('animax.backfill.season', toSlug(before))
    emptySlugs = new Set([toSlug(now)])
    const hook = await setup()
    act(() => hook.result.current.goToNext())
    await waitFor(() => expect(hook.result.current.cards).toEqual([]))
    expect(hook.result.current.season).toEqual(now)
    expect(hook.result.current.seasonDone).toBe(true)
    // 前へ戻るときは、記録済みの空のクールを飛ばす（これまでどおり）
    emptySlugs = new Set([toSlug(before)])
    act(() => hook.result.current.goToPrevious())
    await waitFor(() => expect(hook.result.current.season).toEqual(previousSeason(before)))
  })

  it('jumping through the picker shows the chosen season even when nothing is left, and saves it', async () => {
    const hook = await setup()
    const target = { year: 2012, name: 'spring' } as const
    emptySlugs = new Set([toSlug(target)])
    act(() => hook.result.current.jumpTo(target))
    await waitFor(() => expect(hook.result.current.cards).toEqual([]))
    expect(hook.result.current.season).toEqual(target)
    expect(hook.result.current.seasonDone).toBe(true)
    expect(localStorage.getItem('animax.backfill.season')).toBe(toSlug(target))
  })

  it('undo walks back through several answers in reverse order', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'BAD' }))
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'AVERAGE' }))
    expect(hook.result.current.seasonDone).toBe(true)
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    expect(hook.result.current.current?.work.id).toBe('W1')
    expect(hook.result.current.canUndo).toBe(false)
    await settle(hook)
    expect(calls).toEqual([
      'status W1 WATCHED', 'review W1 BAD -> R1',
      'status W3 WATCHED', 'review W3 AVERAGE -> R2',
      'delete R2', 'status W3 NO_STATE',
      'delete R1', 'status W1 NO_STATE',
    ])
  })
})

describe('useBackfill: looking again at works marked "not watched"', () => {
  const unseenOf = (id: number) => JSON.parse(localStorage.getItem('animax.backfill.unseen')!).unseen[String(id)]

  it('offers them only once the season is done, and only when asked', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GOOD' }))
    expect(hook.result.current.unseenLeft).toBe(0)
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(hook.result.current.seasonDone).toBe(true)
    // 作品1と作品3を「見てない」にした。勝手には山に戻さない
    expect(hook.result.current.unseenLeft).toBe(2)
    expect(hook.result.current.reviewing).toBe(false)
    act(() => hook.result.current.reviewUnseen())
    expect(hook.result.current.reviewing).toBe(true)
    expect(hook.result.current.current?.work.id).toBe('W1')
    // 進み具合は満たしたまま（どれも答え済み）
    expect(hook.result.current.progress).toEqual({ answered: 3, total: 3 })
  })

  it('recording one in the second look takes it out of "not watched"; undo puts it back', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.reviewUnseen())
    act(() => hook.result.current.answer({ kind: 'rate', rating: 'GREAT' }))
    expect(unseenOf(1)).toMatchObject({ active: false })
    expect(hook.result.current.seasonDone).toBe(true)
    expect(hook.result.current.unseenLeft).toBe(0)
    await settle(hook) // 答えを送り終えてから取り消す（送る前の取り消しは、答えの送信ごと取りやめる）
    act(() => hook.result.current.undo())
    expect(unseenOf(1)).toMatchObject({ active: true })
    await settle(hook)
    expect(calls.slice(-3)).toEqual(['review W1 GREAT -> R1', 'delete R1', 'status W1 NO_STATE'])
  })

  it('"not watched" again keeps it so, and undoing that does not clear the earlier mark', async () => {
    const hook = await setup()
    act(() => hook.result.current.answer({ kind: 'skip' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    act(() => hook.result.current.reviewUnseen())
    act(() => hook.result.current.answer({ kind: 'skip' }))
    expect(unseenOf(1)).toMatchObject({ active: true })
    act(() => hook.result.current.undo())
    expect(unseenOf(1)).toMatchObject({ active: true })
  })
})

describe('useBackfill: the season to start from', () => {
  it('starts a first-time user on the previous season, and keeps it', () => {
    const hook = renderHook(() => useBackfill('t'))
    expect(hook.result.current.season).toEqual(previousSeason(seasonOf(new Date())))
    expect(localStorage.getItem('animax.backfill.season')).toBe(toSlug(previousSeason(seasonOf(new Date()))))
  })

  it('keeps the current season for someone who has already seen the guide', () => {
    localStorage.setItem('animax.onboarding.v1', JSON.stringify({ v: 1, at: '2026-10-01T00:00:00.000Z' }))
    const hook = renderHook(() => useBackfill('t'))
    expect(hook.result.current.season).toEqual(seasonOf(new Date()))
  })
})

describe('useBackfill: the deck from the last visit', () => {
  it('shows the stored works of the season at once, keeps the shown card when Annict answers, and drops works recorded elsewhere', async () => {
    const slug = toSlug(seasonOf(new Date()))
    localStorage.setItem('animax.backfill.season', slug)
    // 前回の内容: 作品1〜3（どれも未記録）。Annict の今: 作品2 は別の端末で記録済み
    localStorage.setItem('animax.seasonWorks.v1', JSON.stringify({ v: 1, seasons: { [slug]: { at: '2026-10-05T00:00:00.000Z', works } } }))
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { fetchSeasonWorks } = await import('../../lib/annict')
    vi.mocked(fetchSeasonWorks).mockImplementationOnce(async () => {
      await gate
      return works.map((w) => (w.id === 'W2' ? { ...w, viewerStatusState: 'WATCHED' as const } : w))
    })
    const hook = renderHook(() => useBackfill('t'))
    // 読み直しを待たずに、前回の内容で山が出ている
    await waitFor(() => expect(hook.result.current.current?.work.id).toBe('W1'))
    expect(hook.result.current.staleAt).toBe('2026-10-05T00:00:00.000Z')
    release()
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
    // いま出している作品1はそのまま、まだ出していない分から作品2が外れる
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W3'])
  })

  it('undo puts back the status a work already had on another device, when it was answered before Annict answered', async () => {
    const slug = toSlug(seasonOf(new Date()))
    localStorage.setItem('animax.backfill.season', slug)
    localStorage.setItem('animax.seasonWorks.v1', JSON.stringify({ v: 1, seasons: { [slug]: { at: '2026-10-05T00:00:00.000Z', works } } }))
    // 作品1 は別の端末で「見てる」にしてある。読み直しが届く前に答える
    statusNow.set('W1', 'WATCHING')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { fetchSeasonWorks } = await import('../../lib/annict')
    vi.mocked(fetchSeasonWorks).mockImplementationOnce(async () => {
      await gate
      return works.map((w) => (w.id === 'W1' ? { ...w, viewerStatusState: 'WANNA_WATCH' as const } : w))
    })
    const hook = renderHook(() => useBackfill('t'))
    await waitFor(() => expect(hook.result.current.current?.work.id).toBe('W1'))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    await settle(hook)
    // 書く前に、Annict の今の状態を読む
    expect(calls).toEqual(['read W1', 'status W1 WANNA_WATCH'])
    act(() => hook.result.current.undo())
    await settle(hook)
    // 「未設定」ではなく、書く前の「見てる」に戻す
    expect(calls).toEqual(['read W1', 'status W1 WANNA_WATCH', 'status W1 WATCHING'])
    release()
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
  })

  // O4 の状態の側: 取り消しが失敗したあとでもう一度答えると、書く前の状態として、Annict に残った自分の最初の答えを読んでいた
  it('undoing a second answer puts back the status the failed undo was heading for, without reading the first answer back', async () => {
    const slug = toSlug(seasonOf(new Date()))
    localStorage.setItem('animax.backfill.season', slug)
    localStorage.setItem('animax.seasonWorks.v1', JSON.stringify({ v: 1, seasons: { [slug]: { at: '2026-10-05T00:00:00.000Z', works } } }))
    // 作品1 は別の端末で「見てる」にしてある。読み直しが届く前に答える
    statusNow.set('W1', 'WATCHING')
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { fetchSeasonWorks } = await import('../../lib/annict')
    vi.mocked(fetchSeasonWorks).mockImplementationOnce(async () => {
      await gate
      return works.map((w) => (w.id === 'W1' ? { ...w, viewerStatusState: 'WATCHED' as const } : w))
    })
    const hook = renderHook(() => useBackfill('t'))
    await waitFor(() => expect(hook.result.current.current?.work.id).toBe('W1'))
    act(() => hook.result.current.answer({ kind: 'watched' }))
    await settle(hook)
    expect(calls).toEqual(['read W1', 'status W1 WATCHED'])
    // 取り消しが失敗する。Annict は最初の答え（見た）のまま
    statusNow.set('W1', 'WATCHED')
    vi.mocked(updateStatus).mockRejectedValueOnce(new Error('HTTP 502'))
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(hook.result.current.failed).toHaveLength(1)
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    await settle(hook)
    // もう一度の答えは、書く前の状態を読み直さない
    expect(calls.slice(2)).toEqual(['status W1 WANNA_WATCH'])
    act(() => hook.result.current.undo())
    await settle(hook)
    // 自分の最初の答え（見た）ではなく、別の端末の「見てる」に戻す
    expect(calls.slice(3)).toEqual(['status W1 WATCHING'])
    release()
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
  })

  it('reads the status first only for the shown card that Annict says is recorded; works confirmed unrecorded are written at once', async () => {
    const slug = toSlug(seasonOf(new Date()))
    localStorage.setItem('animax.backfill.season', slug)
    localStorage.setItem('animax.seasonWorks.v1', JSON.stringify({ v: 1, seasons: { [slug]: { at: '2026-10-05T00:00:00.000Z', works } } }))
    // 作品1（いま出している1枚）は別の端末で「見た」にしてある
    statusNow.set('W1', 'WATCHED')
    const { fetchSeasonWorks } = await import('../../lib/annict')
    vi.mocked(fetchSeasonWorks).mockImplementationOnce(async () => works.map((w) => (w.id === 'W1' ? { ...w, viewerStatusState: 'WATCHED' as const } : w)))
    const hook = renderHook(() => useBackfill('t'))
    await waitFor(() => expect(hook.result.current.staleAt).toBeNull())
    expect(hook.result.current.cards?.map((c) => c.work.id)).toEqual(['W1', 'W2', 'W3'])
    act(() => hook.result.current.answer({ kind: 'watching' }))
    act(() => hook.result.current.answer({ kind: 'wanna' }))
    await settle(hook)
    expect(calls).toEqual(['read W1', 'status W1 WATCHING', 'status W2 WANNA_WATCH'])
    act(() => hook.result.current.undo())
    act(() => hook.result.current.undo())
    await settle(hook)
    expect(calls.slice(3)).toEqual(['status W2 NO_STATE', 'status W1 WATCHED'])
  })
})
