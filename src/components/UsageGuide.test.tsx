// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UsageGuide } from './UsageGuide'

afterEach(async () => {
  cleanup()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet).toBeUndefined())
})

describe('UsageGuide', () => {
  it('lists the three steps under the title', () => {
    render(<UsageGuide onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Anipair の使い方' })).toBeTruthy()
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toHaveLength(3)
    expect(steps[0]).toContain('見た作品を評価する')
    expect(steps[0]).toContain('見ていなければ「見てない」、気になれば「見たい」。')
    expect(steps[1]).toBe('10件ほど好きな作品を評価すると、マッチングで好みに合う作品を提案します。')
    expect(steps[2]).toBe('記録はすべてあなたの Annict に保存されます。')
  })

  it('closes with はじめる', () => {
    const onClose = vi.fn()
    render(<UsageGuide onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
