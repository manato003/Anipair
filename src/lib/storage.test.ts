// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ALL_KEYS,
  clearAll,
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
