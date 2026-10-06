// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { saveAnnictToken, switchAccount } from './storage'
import { isStillPending, journalDone, journalPut, keyOf, leftoverEntries, type JournalEntry, type WriteIntent } from './writeJournal'

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
    expect(isStillPending(left[0])).toBe(true)
    // 今回、同じ作品の状態を頼み直した
    journalPut('今回の W1', [status('W1', 'NO_STATE')])
    expect(isStillPending(left[0])).toBe(false)
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

  it('keys every kind of wish', () => {
    expect(keyOf({ kind: 'review', workId: 'W1', annictId: 1, content: { axes: { ratingOverallState: null, ratingStoryState: null, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }, body: '' } })).toBe('review:W1')
    expect(keyOf({ kind: 'episode', episodeId: 'E1', recorded: true, rating: null, since: 0 })).toBe('episode:E1')
    expect(keyOf({ kind: 'match', idMal: 5, title: { native: 'x', romaji: null, english: null }, state: 'WANNA_WATCH' })).toBe('match:5')
  })
})
