// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Media } from '../lib/shikimori'
import { WorkFacts } from './WorkFacts'

const media: Media = {
  idMal: 1,
  title: { native: 'テスト', romaji: null, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2026,
  genres: ['Drama', 'Award Winning', 'Romance'],
  themes: ['School'],
  demographics: [],
  studios: ['A', 'B', 'C'],
  cover: null,
  score: 8.1,
  prequels: [],
  related: [],
}

describe('WorkFacts', () => {
  afterEach(cleanup)

  it('lists the head items with up to two studios, the note, and Japanese genre tags without 受賞作', () => {
    render(<WorkFacts media={media} head={['2026年 秋', 'TV']} note="Annict で 12人が記録" />)
    expect(screen.getByText('2026年 秋 · TV · 制作 A・B')).toBeTruthy()
    expect(screen.getByText('Annict で 12人が記録')).toBeTruthy()
    const tags = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(tags).toEqual(['ドラマ', '恋愛', '学園'])
  })

  it('renders nothing when there is nothing to show', () => {
    const { container } = render(<WorkFacts media={null} head={[null, '']} />)
    expect(container.firstChild).toBeNull()
  })
})
