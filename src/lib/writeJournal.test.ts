// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { saveAnnictToken, switchAccount } from './storage'
import { journalDone, journalPut, keyOf, leftoverEntries, narrowIntent, pendingIntent, type JournalEntry, type WriteIntent } from './writeJournal'

const KEY = 'animax.writeJournal.v1'
const status = (workId: string, state: 'WATCHED' | 'NO_STATE' = 'WATCHED'): WriteIntent => ({ kind: 'status', workId, state })
const stored = (): JournalEntry[] => JSON.parse(localStorage.getItem(KEY) ?? '{"entries":[]}').entries

// 前回開いたときに書かれた控え（別のページの読み込み）
function fromLastVisit(entries: Omit<JournalEntry, 'session'>[]) {
  localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: entries.map((e) => ({ ...e, session: 'last-visit' })) }))
}

afterEach(() => localStorage.clear())

describe('writeJournal', () => {
  it('keeps what was asked until it is done, keyed by work and item', () => {
    const t = journalPut('「作品」の評価', [status('W1'), { kind: 'rating', workId: 'W1', annictId: 1, rating: 'GOOD' }])
    expect(stored().map((e) => e.key)).toEqual(['status:W1', 'rating:W1'])
    journalDone(t)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('keeps only the latest wish for the same item; finishing the older one does not drop the newer', () => {
    const older = journalPut('記録', [status('W1', 'WATCHED')])
    journalPut('取り消し', [status('W1', 'NO_STATE')])
    expect(stored()).toHaveLength(1)
    journalDone(older)
    expect(stored().map((e) => (e.intent as { state: string }).state)).toEqual(['NO_STATE'])
  })

  it('reports only what was left from an earlier visit, oldest first, and knows when it was asked again since', () => {
    fromLastVisit([
      { key: 'status:W2', label: 'B', intent: status('W2'), at: 2, seq: 2 },
      { key: 'status:W1', label: 'A', intent: status('W1'), at: 1, seq: 1 },
    ])
    journalPut('今回', [status('W3')])
    const left = leftoverEntries()
    expect(left.map((e) => e.label)).toEqual(['A', 'B'])
    expect(pendingIntent(left[0])).toEqual(status('W1'))
    // 今回、同じ作品の状態を頼み直した
    journalPut('今回のW1', [status('W1', 'NO_STATE')])
    expect(pendingIntent(left[0])).toBeNull()
    expect(leftoverEntries().map((e) => e.label)).toEqual(['B'])
  })

  it('ignores broken entries', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: [{ key: 'status:W1', label: 'x' }, { key: 'oops', label: 'y', intent: status('W1'), at: 1, seq: 1, session: 's' }] }))
    expect(leftoverEntries()).toEqual([])
  })

  // 2026-10-06 のセキュリティの点検: ログインし直す（新しいトークン）と、送れなかった記録の控えが消えていた。人ごとの記録として持つ
  it('survives the same person logging in again, and is put aside when someone else signs in', () => {
    switchAccount('u1')
    saveAnnictToken('a')
    journalPut('記録', [status('W1')])
    saveAnnictToken('b')
    expect(stored().map((e) => e.key)).toEqual(['status:W1'])
    switchAccount('u2', 'b')
    expect(localStorage.getItem(KEY)).toBeNull()
    // 元の人に戻れば、控えも戻る
    switchAccount('u1', 'c')
    expect(stored().map((e) => e.key)).toEqual(['status:W1'])
  })

  it('drops entries whose wish is missing fields or has values the app never writes, and keeps the well-formed ones', () => {
    const axes = { ratingOverallState: 'GOOD', ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }
    const good: WriteIntent[] = [
      status('W1'),
      { kind: 'rating', workId: 'W2', annictId: 2, rating: null },
      { kind: 'review', workId: 'W3', annictId: 3, content: { axes: axes as never, body: 'よかった' } },
      { kind: 'episode', episodeId: 'E1', recorded: true, rating: 'GREAT', since: 1, comment: 'x' },
      { kind: 'episodeComment', episodeId: 'E2', comment: 'y', rating: null, since: 1 },
      { kind: 'match', idMal: 5, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' },
    ]
    const bad = [
      { kind: 'status', workId: 'W9', state: 'LOVED' },
      { kind: 'status', workId: '', state: 'WATCHED' },
      { kind: 'rating', workId: 'W9', annictId: '9', rating: null },
      { kind: 'review', workId: 'W9', annictId: 9, content: { axes: { ...axes, ratingStoryState: 'SUPER' }, body: '' } },
      { kind: 'review', workId: 'W9', annictId: 9, content: { body: '' } },
      { kind: 'episode', episodeId: 'E9', recorded: 'yes', rating: null, since: 1 },
      { kind: 'episodeComment', episodeId: 'E9', comment: 3, rating: null, since: 1 },
      { kind: 'match', idMal: 9, title: 'x', state: 'WANNA_WATCH' },
      { kind: 'match', idMal: 0, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' },
    ]
    // 壊れた控えも、キーはその中身から作ったもの（キーの食い違いでは落ちない形）にして、中身の確かめで落ちることを見る
    const keyFor = (i: Record<string, unknown>) => `${i.kind === 'episode' || i.kind === 'episodeComment' ? `${i.kind}:${i.episodeId}` : i.kind === 'match' ? `match:${i.idMal}` : `${i.kind}:${i.workId}`}`
    fromLastVisit([...good, ...(bad as never[])].map((intent, i) => ({ key: keyFor(intent as Record<string, unknown>), label: 'x', intent, at: 1, seq: i + 1 })))
    expect(leftoverEntries().map((e) => e.intent)).toEqual(good)
  })

  // 2026-10-12 のレビュー: 感想の保存は総合評価も書く。失敗した古い感想を送り直すと、あとで付け直した総合評価を古い値に戻していた
  describe('items are compared by the value they write, not by the kind of write', () => {
    const axes = (overall: 'GOOD' | 'GREAT' | null) => ({ ratingOverallState: overall, ratingStoryState: 'GOOD' as const, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null })
    const review = (overall: 'GOOD' | 'GREAT' | null, body = '本文'): WriteIntent => ({ kind: 'review', workId: 'W1', annictId: 1, content: { axes: axes(overall), body } })
    const rating = (r: 'GOOD' | 'GREAT'): WriteIntent => ({ kind: 'rating', workId: 'W1', annictId: 1, rating: r })
    // ページを開き直した（今の控えを、前回の分にする）
    const reopen = () => localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: stored().map((e) => ({ ...e, session: 'last-visit' })) }))

    it('a review left unsent keeps its text but not its old overall rating once the overall was changed later', () => {
      journalPut('感想', [review('GOOD')])
      journalDone(journalPut('総合評価', [rating('GREAT')]))
      expect(stored()).toHaveLength(1)
      expect(stored()[0].dropped).toEqual(['overall'])
      reopen()
      // 開き直したあとの送り直しでも、感想の中身だけ（総合評価は Annict の今の値のまま）
      expect(pendingIntent(leftoverEntries()[0])).toEqual({ ...review('GOOD'), keepOverall: true })
    })

    it('a rating left unsent is dropped when a later review writes the overall rating too', () => {
      journalPut('総合評価', [rating('GOOD')])
      journalPut('感想', [review('GREAT')])
      expect(stored().map((e) => e.key)).toEqual(['review:W1'])
    })

    it('a matching answer and a change of the same work elsewhere are the same item, told apart by the MyAnimeList id', () => {
      const match: WriteIntent = { kind: 'match', idMal: 5, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH', rating: 'GOOD' }
      journalPut('マッチング', [match])
      journalPut('状態', [{ kind: 'status', workId: 'W1', state: 'WATCHED', idMal: 5 }])
      reopen()
      // 状態はあとの「見た」を残し、マッチングの答えからは評価だけを書く
      expect(pendingIntent(leftoverEntries()[0])).toEqual({ ...match, keepState: true })
      journalPut('評価', [{ kind: 'rating', workId: 'W1', annictId: 1, rating: 'GREAT', idMal: 5 }])
      // 評価も付け直したので、マッチングの答えはもう書くものが無い（控えから消える）
      expect(stored().map((e) => e.key)).toEqual(['status:W1', 'rating:W1'])
    })

    it('narrows a review to its overall rating when only the text was written again', () => {
      expect(narrowIntent(review('GOOD'), new Set(['review']))).toEqual(rating('GOOD'))
      expect(narrowIntent(review('GOOD'), new Set(['review', 'overall']))).toBeNull()
      expect(narrowIntent(review('GOOD'), new Set())).toEqual(review('GOOD'))
    })

    it('ignores a stored entry whose list of dropped items is broken', () => {
      fromLastVisit([{ key: 'status:W1', label: 'x', intent: status('W1'), at: 1, seq: 1, dropped: ['nope' as never] }])
      expect(leftoverEntries()).toEqual([])
    })
  })

  it('keys every kind of wish', () => {
    expect(keyOf({ kind: 'review', workId: 'W1', annictId: 1, content: { axes: { ratingOverallState: null, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }, body: '' } })).toBe('review:W1')
    expect(keyOf({ kind: 'episode', episodeId: 'E1', recorded: true, rating: null, since: 0 })).toBe('episode:E1')
    expect(keyOf({ kind: 'match', idMal: 5, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' })).toBe('match:5')
  })
})
