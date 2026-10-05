// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tour } from './Tour'
import { presentSteps, type TourStep } from './tourSteps'

afterEach(async () => {
  cleanup()
  // 閉じたあとに履歴が元に戻るまで待つ（Sheet.test と同じ）
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

// jsdom は大きさを測らないので、見えている要素にだけ大きさを付ける
function screenWith(html: string, shown: string[]): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  for (const el of root.querySelectorAll('*')) {
    const size = shown.some((sel) => el.matches(sel)) ? 40 : 0
    el.getBoundingClientRect = () => ({ top: 100, left: 20, width: size, height: size, right: 20 + size, bottom: 100 + size, x: 20, y: 100, toJSON: () => ({}) })
  }
  return root
}

const STEPS: TourStep[] = [
  { target: '.a', title: 'いちばん', body: 'Aの説明' },
  { target: '.missing', title: '無いもの', body: '飛ばす' },
  { target: ['.hidden-box', '.b'], title: 'に', body: 'Bの説明' },
  { target: '.c', title: 'さん', body: 'Cの説明' },
]

describe('presentSteps', () => {
  it('keeps only the steps whose target is on the screen and visible, trying alternatives in order', () => {
    const root = screenWith('<div class="a"></div><div class="hidden-box"><div class="b"></div></div><div class="c"></div>', ['.a', '.b', '.c'])
    const steps = presentSteps(root, STEPS)
    expect(steps.map((s) => s.step.title)).toEqual(['いちばん', 'に', 'さん'])
    // 見えない箱（大きさ 0）は飛ばして、次の候補（.b）を示す
    expect((steps[1].el as HTMLElement).className).toBe('b')
  })
})

describe('Tour', () => {
  function open() {
    const root = screenWith('<div class="a"></div><div class="b"></div><div class="c"></div>', ['.a', '.b', '.c'])
    const steps = presentSteps(root, STEPS)
    const onClose = vi.fn()
    const onText = vi.fn()
    render(<Tour label="使い方" steps={steps} onClose={onClose} onText={onText} />)
    return { onClose, onText }
  }

  it('walks through the steps with next and back, and finishes on the last one', () => {
    const { onClose } = open()
    expect(screen.getByRole('dialog', { name: '使い方' })).toBeTruthy()
    expect(screen.getByText('Aの説明')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '戻る' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    expect(screen.getByText('Bの説明')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '戻る' }))
    expect(screen.getByText('Aの説明')).toBeTruthy()
    // 吹き出しの外をタップしても次へ
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByText('Bの説明')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('Cの説明')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'わかった' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tapping inside the bubble does not advance; Esc and おわる close; 文章で詳しく読む switches to the text', () => {
    const { onClose, onText } = open()
    fireEvent.click(screen.getByText('Aの説明'))
    expect(screen.getByText('Aの説明')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '文章で詳しく読む' }))
    expect(onText).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('keeps the screen keys from answering while open (it takes the arrow keys first)', () => {
    open()
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(behind).not.toHaveBeenCalled()
    window.removeEventListener('keydown', behind)
  })
})
