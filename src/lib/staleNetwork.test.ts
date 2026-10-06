// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchViewer } from './annict'
import { readJson } from './github'
import { loadAnnictToken } from './storage'

// 2026-10-06 のセキュリティの点検: アカウントを切り替えたあとの古いページが、前の人のトークンやつなぎで通信できた
describe('a page left behind after the account changed does not talk to Annict or GitHub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('refuses before sending anything', async () => {
    localStorage.setItem('animax.annictToken', 'tok-a')
    localStorage.setItem('animax.owner.v1', 'u1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    // ページを開いた（最初に読んだ時点の持ち主を覚える）
    expect(loadAnnictToken()).toBe('tok-a')
    // 別のタブで、別の人に切り替わった
    localStorage.setItem('animax.owner.v1', 'u2')
    localStorage.setItem('animax.annictToken', 'tok-b')
    await expect(fetchViewer('tok-a')).rejects.toThrow('アカウントが切り替わった')
    await expect(readJson({ token: 'gh', repo: 'a/b' }, 'passes.json')).rejects.toThrow('アカウントが切り替わった')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
