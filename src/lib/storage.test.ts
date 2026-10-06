// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_KEYS,
  saveWriteJournalRaw,
  POSTERS_MAX,
  clearAll,
  forgetAccount,
  freezeStorage,
  hasUnclaimed,
  loadOwner,
  loadPassesRaw,
  pageIsCurrent,
  savePassesRaw,
  setAsideUnclaimed,
  settleUnclaimed,
  switchAccount,
  loadOnboardingSeen,
  loadReviewsRaw,
  parseOnboardingSeen,
  saveOnboardingSeen,
  saveAnnictToken,
  saveReviewsRaw,
  loadGithubConnection,
  loadGithubRepo,
  clearLegacyCovers,
  loadPosters,
  loadSimilar,
  parsePosters,
  parseSimilar,
  savePosters,
  saveSimilar,
  parseRepo,
  parseSkipped,
  saveGithubRepo,
  saveGithubToken,
} from './storage'

describe('parseSkipped', () => {
  it('keeps only positive integers', () => {
    expect(parseSkipped([3, 0, -1, 2.5, '7', null, 12])).toEqual([3, 12])
  })

  it.each([null, {}, 'x', 5])('treats %j as empty', (v) => {
    expect(parseSkipped(v)).toEqual([])
  })
})

describe('parsePosters', () => {
  it('drops broken entries and keeps the rest', () => {
    const posters = parsePosters({
      '52991': { o: 'https://img.example/a.jpg', m: 'https://img.example/a-s.webp' },
      '1': { o: 'javascript:alert(1)', m: 'https://img.example/x.webp' },
      '2': { o: 'https://img.example/b.jpg', m: 'http://insecure.example/b.webp' },
      abc: { o: 'https://img.example/c.jpg', m: 'https://img.example/c-s.webp' },
      '0': { o: 'https://img.example/z.jpg', m: 'https://img.example/z-s.webp' },
      '3': 'nope',
      '4': { o: 'https://img.example/d.jpg', m: 'https://img.example/d-s.webp' },
    })
    expect([...posters.keys()]).toEqual([4, 52991])
    expect(posters.get(52991)).toEqual({ o: 'https://img.example/a.jpg', m: 'https://img.example/a-s.webp' })
  })

  it.each([null, undefined, [], 'x'])('treats %j as empty', (v) => {
    expect(parsePosters(v).size).toBe(0)
  })

  it('stores under a new key and removes the previous version once', () => {
    localStorage.setItem('animax.covers.v1', '{"1":{"url":"https://old.example/1.jpg","color":null}}')
    savePosters(new Map([[5, { o: 'https://a.example/o.jpg', m: 'https://a.example/m.webp' }]]))
    expect(JSON.parse(localStorage.getItem('animax.covers.v2')!)).toEqual({ '5': { o: 'https://a.example/o.jpg', m: 'https://a.example/m.webp' } })
    expect(loadPosters().get(5)?.m).toBe('https://a.example/m.webp')
    clearLegacyCovers()
    expect(localStorage.getItem('animax.covers.v1')).toBeNull()
    expect(localStorage.getItem('animax.covers.v2')).not.toBeNull()
  })
})

describe('parseSimilar', () => {
  const NOW = 1_800_000_000_000
  const DAY = 24 * 60 * 60 * 1000

  it('keeps valid entries and drops broken or expired ones (30 days)', () => {
    const m = parseSimilar(
      {
        '1': { at: NOW - 29 * DAY, ids: [10, 11] },
        '2': { at: NOW - 31 * DAY, ids: [10] },
        '3': { at: NOW, ids: [10, 'x'] },
        '4': { at: 'now', ids: [1] },
        '5': { at: NOW, ids: 'nope' },
        '6': { at: NOW + 10 * DAY, ids: [1] },
        abc: { at: NOW, ids: [1] },
        '7': { at: NOW - DAY, ids: [] },
      },
      NOW,
    )
    expect([...m.keys()]).toEqual([1, 7])
    expect(m.get(1)?.ids).toEqual([10, 11])
  })

  it.each([null, undefined, [], 'x', 5])('treats %j as empty', (v) => {
    expect(parseSimilar(v, NOW).size).toBe(0)
  })

  it('keeps at most 500 entries, the newest', () => {
    const raw = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [String(i + 1), { at: NOW - i * 1000, ids: [1] }]))
    const m = parseSimilar(raw, NOW)
    expect(m.size).toBe(500)
    expect(m.has(1)).toBe(true)
    expect(m.has(520)).toBe(false)
  })

  it('round-trips through localStorage', () => {
    saveSimilar(new Map([[9, { at: Date.now(), ids: [1, 2, 3] }]]))
    expect(loadSimilar().get(9)?.ids).toEqual([1, 2, 3])
  })
})

describe('parseRepo', () => {
  it.each(['someone/their-data', 'a/b', 'user-1/anipair-data', 'u/my.repo_2-x', `${'a'.repeat(39)}/${'b'.repeat(100)}`])('accepts %s', (v) => {
    expect(parseRepo(v)).toBe(v)
  })

  it('trims the spaces around it', () => {
    expect(parseRepo('  me/anipair-data ')).toBe('me/anipair-data')
  })

  it.each([
    null,
    undefined,
    42,
    '',
    'noslash',
    '/name',
    'owner/',
    'a/b/c',
    'has space/name',
    'owner/na me',
    '-ok/x/../y',
    'under_score/name',
    'ow.ner/name',
    `${'a'.repeat(40)}/b`,
    `a/${'b'.repeat(101)}`,
    'me/..',
    'me/.',
    'https://github.com/me/repo',
    'me/repo?x=1',
    'me/repo#frag',
    'me/日本語',
  ])('rejects %j', (v) => {
    expect(parseRepo(v)).toBeNull()
  })
})

describe('GitHub connection in localStorage', () => {
  beforeEach(() => localStorage.clear())

  it('falls back to "not set" when nothing is stored', () => {
    expect(loadGithubRepo()).toBeNull()
    expect(loadGithubConnection()).toBeNull()
  })

  it('keeps the existing token key and stores the repository under a new key', () => {
    saveGithubToken('tok')
    saveGithubRepo('me/anipair-data')
    expect(localStorage.getItem('animax.githubToken')).toBe('tok')
    expect(localStorage.getItem('animax.githubRepo')).toBe('me/anipair-data')
    expect(loadGithubConnection()).toEqual({ token: 'tok', repo: 'me/anipair-data' })
  })

  it('is not connected with only one of the two', () => {
    saveGithubToken('tok')
    expect(loadGithubConnection()).toBeNull()
    saveGithubToken(null)
    saveGithubRepo('me/anipair-data')
    expect(loadGithubConnection()).toBeNull()
  })

  it('ignores a broken stored repository', () => {
    saveGithubToken('tok')
    localStorage.setItem('animax.githubRepo', 'not a repo')
    expect(loadGithubRepo()).toBeNull()
    expect(loadGithubConnection()).toBeNull()
  })

  it('clears both when disconnected', () => {
    saveGithubToken('tok')
    saveGithubRepo('me/anipair-data')
    saveGithubToken(null)
    saveGithubRepo(null)
    expect(loadGithubConnection()).toBeNull()
    expect(localStorage.getItem('animax.githubRepo')).toBeNull()
  })
})

describe('the reviews snapshot (animax.reviews.v1)', () => {
  beforeEach(() => localStorage.clear())

  it('is part of ALL_KEYS and is removed by clearAll', () => {
    expect(ALL_KEYS).toContain('animax.reviews.v1')
    saveReviewsRaw({ v: 1 })
    clearAll()
    expect(loadReviewsRaw()).toBeNull()
  })

  it('is removed when the Annict token changes to another value, or is cleared', () => {
    saveAnnictToken('A')
    saveReviewsRaw({ v: 1 })
    saveAnnictToken('B')
    expect(loadReviewsRaw()).toBeNull()

    saveReviewsRaw({ v: 1 })
    saveAnnictToken(null)
    expect(loadReviewsRaw()).toBeNull()
  })

  it('is kept when the same token is saved again (even with spaces around it)', () => {
    saveAnnictToken('A')
    saveReviewsRaw({ v: 1 })
    saveAnnictToken('A')
    saveAnnictToken(' A ')
    expect(loadReviewsRaw()).toEqual({ v: 1 })
  })

  it('reads a broken value as nothing', () => {
    localStorage.setItem('animax.reviews.v1', '{broken')
    expect(loadReviewsRaw()).toBeNull()
  })
})

describe('the first-run guide flag (animax.onboarding.v1)', () => {
  beforeEach(() => localStorage.clear())

  it('is unseen until saved, and saving false forgets it', () => {
    expect(loadOnboardingSeen()).toBe(false)
    saveOnboardingSeen(true)
    expect(loadOnboardingSeen()).toBe(true)
    expect(JSON.parse(localStorage.getItem('animax.onboarding.v1')!)).toMatchObject({ v: 1 })
    saveOnboardingSeen(false)
    expect(loadOnboardingSeen()).toBe(false)
    expect(localStorage.getItem('animax.onboarding.v1')).toBeNull()
  })

  it.each([null, undefined, true, 'seen', [], {}, { v: 2, at: 'x' }, { v: 1 }, { v: 1, at: 5 }])('treats the broken value %j as unseen', (v) => {
    expect(parseOnboardingSeen(v)).toBe(false)
  })

  it('reads a damaged saved value as unseen', () => {
    localStorage.setItem('animax.onboarding.v1', '{not json')
    expect(loadOnboardingSeen()).toBe(false)
  })

  it('is part of ALL_KEYS and is removed by clearAll', () => {
    expect(ALL_KEYS).toContain('animax.onboarding.v1')
    saveOnboardingSeen(true)
    clearAll()
    expect(loadOnboardingSeen()).toBe(false)
  })
})

// 2026-10-06 の点検: 共有の端末で、前の人の称号やパス・GitHub のつなぎが次の人に引き継がれていた
describe('per-person records (switchAccount)', () => {
  beforeEach(() => localStorage.clear())
  const passes = () => localStorage.getItem('animax.passes')
  const titles = () => localStorage.getItem('animax.titles.v1')

  it('takes the records already on the device as the first person to sign in', () => {
    localStorage.setItem('animax.passes', '{"a":1}')
    expect(switchAccount('alice')).toBe(false)
    expect(loadOwner()).toBe('alice')
    expect(passes()).toBe('{"a":1}')
  })

  it('puts the previous person aside for someone else, and gives them back on their next sign-in', () => {
    switchAccount('alice')
    localStorage.setItem('animax.passes', '{"a":1}')
    localStorage.setItem('animax.titles.v1', '{"equipped":"x"}')
    localStorage.setItem('animax.githubToken', 'gh-alice')
    localStorage.setItem('animax.effects.v1', 'calm')
    // ログアウト: 退避するだけ
    expect(switchAccount(null)).toBe(true)
    expect(passes()).toBeNull()
    expect(loadGithubConnection()).toBeNull()
    // 端末の設定（演出）は人ごとではない
    expect(localStorage.getItem('animax.effects.v1')).toBe('calm')
    // 別の人: 何も引き継がない
    switchAccount('bob')
    expect(passes()).toBeNull()
    expect(titles()).toBeNull()
    localStorage.setItem('animax.passes', '{"b":1}')
    // 元の人に戻る
    switchAccount('alice')
    expect(passes()).toBe('{"a":1}')
    expect(titles()).toBe('{"equipped":"x"}')
    // GitHub のトークンは退避の控えに残さない（もう一度つなぐときに入れ直す）
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('gh-alice')
    switchAccount('bob')
    expect(passes()).toBe('{"b":1}')
  })

  it('logging in again as the same person keeps everything (a new token each time)', () => {
    switchAccount('alice')
    saveAnnictToken('t1')
    localStorage.setItem('animax.passes', '{"a":1}')
    saveAnnictToken('t2')
    expect(switchAccount('alice')).toBe(false)
    expect(passes()).toBe('{"a":1}')
  })

  // 名前を確かめられないログインでは、前の人の記録を見せない（fail-closed）。同じトークンで分かったら、その人の分を戻す
  it('a sign-in whose name is not known yet puts the previous person aside, and gives theirs back once known', () => {
    switchAccount('alice')
    localStorage.setItem('animax.passes', '{"a":1}')
    localStorage.setItem('animax.githubToken', 'gh-alice')
    switchAccount(null)
    switchAccount(null, 'tok-a2')
    expect(passes()).toBeNull()
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    // 名前が分からないあいだに付けた分は残し、無い分だけ戻す
    localStorage.setItem('animax.titles.v1', '{"equipped":"new"}')
    expect(switchAccount('alice', 'tok-a2')).toBe(true)
    expect(passes()).toBe('{"a":1}')
    expect(titles()).toBe('{"equipped":"new"}')
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
  })

  // 2026-10-06 のセキュリティの点検: 名前の分からないままログアウトした記録を、次の別の人が引き継いでいた
  it('records made while the name was unknown are not handed to the next person', () => {
    switchAccount(null, 'tok-x')
    localStorage.setItem('animax.passes', '{"x":1}')
    switchAccount(null)
    expect(passes()).toBeNull()
    switchAccount('carol', 'tok-c')
    expect(passes()).toBeNull()
    // 別のトークンに替わったときも同じ
    switchAccount(null, 'tok-y')
    localStorage.setItem('animax.passes', '{"y":1}')
    switchAccount('dave', 'tok-d')
    expect(passes()).toBeNull()
    // 同じトークンで名前が分かったときだけ、その人のものになる
    switchAccount(null, 'tok-e')
    localStorage.setItem('animax.passes', '{"e":1}')
    switchAccount('erin', 'tok-e')
    expect(passes()).toBe('{"e":1}')
    expect(loadOwner()).toBe('erin')
    // 持ち主を確かめられなかった記録は、退避の控えにも残さない
    expect(Object.keys(JSON.parse(localStorage.getItem('animax.accounts.v1') ?? '{}')).filter((k) => k.startsWith('?'))).toEqual([])
  })

  // 2026-10-06 のセキュリティの点検: ログアウトのあとに届いた前の人の書き込み（GitHub の同期・バックアップ・別のタブ）を、次の人が引き継いでいた
  it('records written after logging out are not handed to the next person', () => {
    switchAccount('alice')
    switchAccount(null)
    expect(loadOwner()).toBe('!')
    // ログアウトのあとに遅れて届いた書き込み
    localStorage.setItem('animax.backfill.unseen', '{"unseen":{"1":{}}}')
    localStorage.setItem('animax.githubToken', 'gh-late')
    switchAccount('bob', 'tok-b')
    expect(localStorage.getItem('animax.backfill.unseen')).toBeNull()
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    // 前の人の退避にも混ぜない
    switchAccount('alice', 'tok-a')
    expect(localStorage.getItem('animax.backfill.unseen')).toBeNull()
  })

  it('when the name becomes known, merges the tables made meanwhile with the kept ones, and keeps the rest of the kept records', () => {
    switchAccount('alice')
    localStorage.setItem('animax.passes', JSON.stringify({ v: 1, passes: { '1': { at: 'a' } } }))
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: 'kept', seen: ['x'], awakened: true }))
    switchAccount(null)
    switchAccount(null, 'tok-a')
    localStorage.setItem('animax.passes', JSON.stringify({ v: 1, passes: { '2': { at: 'b' } } }))
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: false }))
    switchAccount('alice', 'tok-a')
    expect(JSON.parse(passes()!).passes).toEqual({ '1': { at: 'a' }, '2': { at: 'b' } })
    expect(JSON.parse(titles()!).equipped).toBe('kept')
  })

  it('keeps the records of a person whose Annict name is __proto__', () => {
    switchAccount('__proto__')
    localStorage.setItem('animax.passes', '{"p":1}')
    switchAccount('bob')
    expect(passes()).toBeNull()
    switchAccount('__proto__')
    expect(passes()).toBe('{"p":1}')
  })

  it('forgetAccount removes the person\'s records, including what was put aside', () => {
    switchAccount('alice')
    localStorage.setItem('animax.passes', '{"a":1}')
    switchAccount('bob')
    switchAccount('alice')
    forgetAccount()
    expect(passes()).toBeNull()
    expect(loadOwner()).toBe('!')
    expect(localStorage.getItem('animax.accounts.v1')).toBeNull()
  })
})

// 2026-10-06 のセキュリティの点検（作り直しの再点検）: 切り替えたあとの古いページが、次の人の記録を読んで前の人の GitHub に送れた
describe('a page left behind after the account changed (pageIsCurrent)', () => {
  beforeEach(() => localStorage.clear())

  it('cannot read or write personal records once another tab switched the account', () => {
    switchAccount('u1')
    saveAnnictToken('tok-a')
    localStorage.setItem('animax.passes', '{"a":1}')
    expect(pageIsCurrent()).toBe(true)
    // 別のタブが、別の人に切り替えた
    localStorage.setItem('animax.annictToken', 'tok-b')
    localStorage.setItem('animax.owner.v1', 'u2')
    localStorage.setItem('animax.passes', '{"b":1}')
    expect(pageIsCurrent()).toBe(false)
    expect(loadPassesRaw()).toBeNull()
    savePassesRaw({ a: 2 })
    expect(localStorage.getItem('animax.passes')).toBe('{"b":1}')
  })

  it('stops after this page switched and froze, until it reloads', () => {
    switchAccount('u1')
    saveAnnictToken('tok-a')
    saveAnnictToken('tok-b')
    switchAccount('u2', 'tok-b')
    // このページ自身の切り替えは、続けて使える
    expect(pageIsCurrent()).toBe(true)
    freezeStorage()
    expect(pageIsCurrent()).toBe(false)
    savePassesRaw({ late: 1 })
    expect(localStorage.getItem('animax.passes')).toBeNull()
  })
})

describe('records whose owner could not be confirmed (unclaimed)', () => {
  beforeEach(() => localStorage.clear())

  it('are set aside without the GitHub token, and given back only when the person says they are theirs', () => {
    localStorage.setItem('animax.passes', JSON.stringify({ v: 1, passes: { '1': { at: 'x' } } }))
    localStorage.setItem('animax.githubToken', 'gh-old')
    setAsideUnclaimed()
    expect(localStorage.getItem('animax.passes')).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('gh-old')
    switchAccount('u5', 'tok')
    expect(hasUnclaimed()).toBe(true)
    expect(localStorage.getItem('animax.passes')).toBeNull()
    settleUnclaimed(true)
    expect(JSON.parse(localStorage.getItem('animax.passes')!).passes).toEqual({ '1': { at: 'x' } })
    expect(hasUnclaimed()).toBe(false)
  })

  it('are deleted when the person says they are not theirs', () => {
    localStorage.setItem('animax.passes', '{"x":1}')
    setAsideUnclaimed()
    settleUnclaimed(false)
    expect(hasUnclaimed()).toBe(false)
    expect(localStorage.getItem('animax.passes')).toBeNull()
  })
})

// 2026-10-06 のセキュリティの点検（3回目）
describe('round 3 of the security check', () => {
  beforeEach(() => localStorage.clear())

  it('clearAll removes everything even with a token (removing the token first used to stop the rest)', () => {
    saveAnnictToken('tok')
    switchAccount('u1', 'tok')
    localStorage.setItem('animax.passes', '{"a":1}')
    localStorage.setItem('animax.githubToken', 'gh')
    localStorage.setItem('animax.accounts.v1', '{"u9":{"animax.passes":"{}"}}')
    clearAll()
    for (const k of ['animax.annictToken', 'animax.passes', 'animax.githubToken', 'animax.accounts.v1', 'animax.owner.v1']) expect(localStorage.getItem(k)).toBeNull()
  })

  it('keeps both the kept and the new unsent writes when the name becomes known', () => {
    switchAccount('u1')
    localStorage.setItem('animax.writeJournal.v1', JSON.stringify({ v: 1, entries: [{ key: 'status:W1', at: 1 }] }))
    localStorage.setItem('animax.uncertainWrites.v1', JSON.stringify([{ kind: 'review', workId: 'W1' }]))
    switchAccount(null)
    switchAccount(null, 'tok')
    localStorage.setItem('animax.writeJournal.v1', JSON.stringify({ v: 1, entries: [{ key: 'status:W2', at: 2 }, { key: 'status:W1', at: 3 }] }))
    localStorage.setItem('animax.uncertainWrites.v1', JSON.stringify([{ kind: 'record', episodeId: 'E1' }]))
    switchAccount('u1', 'tok')
    const entries = JSON.parse(localStorage.getItem('animax.writeJournal.v1')!).entries as { key: string; at: number }[]
    expect(entries.map((e) => `${e.key}@${e.at}`).sort()).toEqual(['status:W1@3', 'status:W2@2'])
    expect(JSON.parse(localStorage.getItem('animax.uncertainWrites.v1')!)).toHaveLength(2)
  })

  it('records set aside as unclaimed leave out the unsent writes of the previous person', () => {
    localStorage.setItem('animax.passes', '{"x":1}')
    localStorage.setItem('animax.writeJournal.v1', JSON.stringify({ v: 1, entries: [{ key: 'rating:W1', at: 1 }] }))
    setAsideUnclaimed()
    switchAccount('u2', 'tok')
    settleUnclaimed(true)
    expect(localStorage.getItem('animax.passes')).toBe('{"x":1}')
    expect(localStorage.getItem('animax.writeJournal.v1')).toBeNull()
  })
})

// 2026-10-07 の点検: 端末の保存容量があふれると、送れなかった記録の控えが黙って保存されなかった
describe('when the device storage is full', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  // 中身の合計が limit 文字を超える書き込みを、ブラウザと同じ QuotaExceededError で断る
  function limitStorage(limit: number) {
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      let used = 0
      for (let i = 0; i < this.length; i++) {
        const k = this.key(i)!
        if (k !== key) used += k.length + (this.getItem(k) ?? '').length
      }
      if (used + key.length + value.length > limit) throw new DOMException('full', 'QuotaExceededError')
      original.call(this, key, value)
    })
  }

  it('drops the rebuildable caches once and keeps the unsent writes, leaving personal records alone', () => {
    localStorage.setItem('animax.covers.v2', 'x'.repeat(5000))
    localStorage.setItem('animax.library.v1', 'y'.repeat(3000))
    localStorage.setItem('animax.passes', '{"keep":1}')
    limitStorage(9000)
    saveWriteJournalRaw({ v: 1, entries: [{ key: 'status:W1', big: 'z'.repeat(2000) }] })
    expect(localStorage.getItem('animax.writeJournal.v1')).toContain('status:W1')
    expect(localStorage.getItem('animax.covers.v2')).toBeNull()
    expect(localStorage.getItem('animax.library.v1')).toBeNull()
    expect(localStorage.getItem('animax.passes')).toBe('{"keep":1}')
  })

  it('keeps at most POSTERS_MAX covers, the newest works (largest Annict IDs) first', () => {
    const posters = new Map(Array.from({ length: POSTERS_MAX + 10 }, (_, i) => [i + 1, { o: 'https://a/o', m: 'https://a/m' }] as const))
    savePosters(new Map(posters))
    const saved = Object.keys(JSON.parse(localStorage.getItem('animax.covers.v2')!)).map(Number)
    expect(saved).toHaveLength(POSTERS_MAX)
    expect(Math.min(...saved)).toBe(11)
  })
})
