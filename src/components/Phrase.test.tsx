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

  it('does not break right after Latin letters joined to kanji or katakana', () => {
    expect(phraseChunks('FX戦士くるみちゃん')).toEqual(['FX戦士', 'くるみちゃん'])
    expect(phraseChunks('TVアニメ')).toEqual(['TVアニメ'])
    expect(phraseChunks('Tier表は')).toEqual(['Tier表は'])
    expect(phraseChunks('Re:ゼロ')).toEqual(['Re:ゼロ'])
    // 英字をつないでいない語のあとのひらがなは、これまでどおり前につなげる
    expect(phraseChunks('設定で連携すると')).toEqual(['設定で', '連携すると'])
    // 空白のあとと、カタカナのあとの英字では、これまでどおり折れる
    expect(phraseChunks('Sonny Boy')).toEqual(['Sonny ', 'Boy'])
    expect(phraseChunks('機動戦士ガンダムSEED')).toContain('SEED')
  })
})

describe('Phrase', () => {
  it('renders the same text, with break opportunities only between chunks', () => {
    const { container } = render(<Phrase text="サスペンス・アクション" />)
    expect(container.textContent).toBe('サスペンス・アクション')
    expect(container.querySelectorAll('wbr').length).toBeGreaterThan(0)
  })
})
