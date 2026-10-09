// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { phraseChunks } from '../lib/phrase'
import { Phrase } from './Phrase'

describe('phraseChunks', () => {
  it('keeps katakana words and particles together, and breaks only between words', () => {
    expect(phraseChunks('機動戦士ガンダム 水星の魔女')).toContain('ガンダム ')
    expect(phraseChunks('薬屋のひとりごと 第3期')).toContain('第3期')
    expect(phraseChunks('『新世紀エヴァンゲリオン』').some((c) => c === '『')).toBe(false)
    expect(phraseChunks('好きなジャンル: サスペンス・アクション')).toContain('アクション')
    const title = phraseChunks('青春ブタ野郎はディアフレンドの夢を見ない')
    expect(title.join('')).toBe('青春ブタ野郎はディアフレンドの夢を見ない')
    expect(title).toContain('夢を')
    expect(title.some((c) => c.includes('アクシ') && !c.includes('アクション'))).toBe(false)
  })
})

describe('Phrase', () => {
  it('renders the same text, with break opportunities only between chunks', () => {
    const { container } = render(<Phrase text="サスペンス・アクション" />)
    expect(container.textContent).toBe('サスペンス・アクション')
    expect(container.querySelectorAll('wbr').length).toBeGreaterThan(0)
  })
})
