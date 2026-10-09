// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsageGuide } from './UsageGuide'

afterEach(async () => {
  cleanup()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet).toBeUndefined())
})

const heading = () => screen.getByRole('heading', { level: 2 }).textContent

describe('UsageGuide', () => {
  it('walks through the whole app in seven pages with Ani and Pair, a picture of each screen, and back and next', () => {
    render(<UsageGuide onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
    expect(heading()).toBe('ようこそ、Anipair へ')
    expect(screen.getByText('1 / 7')).toBeTruthy()
    expect((screen.getByRole('button', { name: '戻る' }) as HTMLButtonElement).disabled).toBe(true)
    const titles = [heading()]
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: '次へ' }))
      titles.push(heading())
    }
    expect(titles).toEqual([
      'ようこそ、Anipair へ',
      '評価: 表紙を見て、答える',
      'マッチング: 次の好きを見つける',
      '記録: 見てる・見た・見たい',
      'ブラウズ: 作品を探す',
      '画面の行き来と、困ったとき',
      'さあ、はじめよう',
    ])
    // 最後のページは「はじめる」
    expect(screen.queryByRole('button', { name: '次へ' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(heading()).toBe('画面の行き来と、困ったとき')
    // 画面のページには、画面を簡単にした図がある
    expect(document.querySelector('.guide-wire')).toBeTruthy()
  })

  it('closes with はじめる on the last page', () => {
    const onClose = vi.fn()
    render(<UsageGuide onClose={onClose} />)
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
