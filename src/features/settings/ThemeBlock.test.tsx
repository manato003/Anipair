// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeBlock } from './ThemeBlock'

afterEach(() => {
  cleanup()
  localStorage.clear()
  const root = document.documentElement
  for (const k of ['scheme', 'season', 'darker', 'hand']) delete root.dataset[k]
})

const group = (name: string) => within(screen.getByRole('group', { name }))

describe('ThemeBlock', () => {
  it('starts from automatic choices, saves each change and marks the page', () => {
    render(<ThemeBlock />)
    expect(group('テーマの色').getByRole('button', { name: '自動' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(group('テーマの色').getByRole('button', { name: '冬' }))
    expect(document.documentElement.dataset.season).toBe('winter')
    fireEvent.click(group('明るさ').getByRole('button', { name: 'もっと暗い' }))
    expect(document.documentElement.dataset.scheme).toBe('dark')
    expect(document.documentElement.dataset.darker).toBe('')
    fireEvent.click(group('片手操作').getByRole('button', { name: '左手' }))
    expect(document.documentElement.dataset.hand).toBe('left')
    expect(JSON.parse(localStorage.getItem('animax.theme.v1') ?? '{}')).toEqual({ color: 'winter', brightness: 'darker', tod: true, hand: 'left', motion: 'auto' })
  })

  it('turns the time-of-day shade off', () => {
    render(<ThemeBlock />)
    fireEvent.click(group('時刻で色を変える').getByRole('button', { name: 'しない' }))
    expect(document.documentElement.style.getPropertyValue('--tod')).toBe('0%')
  })
})
