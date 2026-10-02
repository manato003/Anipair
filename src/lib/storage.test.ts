// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadGithubConnection,
  loadGithubRepo,
  parseCovers,
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

describe('parseCovers', () => {
  it('drops broken entries and keeps the rest', () => {
    const covers = parseCovers({
      '52991': { url: 'https://img.example/a.jpg', color: '#e4a15d' },
      '1': { url: 'javascript:alert(1)', color: '#000000' },
      '2': { url: 'http://insecure.example/b.jpg', color: null },
      abc: { url: 'https://img.example/c.jpg', color: null },
      '3': 'nope',
      '4': { url: 'https://img.example/d.jpg', color: 'red' },
    })
    expect([...covers.keys()]).toEqual([4, 52991])
    expect(covers.get(52991)).toEqual({ url: 'https://img.example/a.jpg', color: '#e4a15d' })
    expect(covers.get(4)).toEqual({ url: 'https://img.example/d.jpg', color: null })
  })

  it.each([null, [], 'x'])('treats %j as empty', (v) => {
    expect(parseCovers(v).size).toBe(0)
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
