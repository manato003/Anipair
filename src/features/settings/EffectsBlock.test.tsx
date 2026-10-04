// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EffectsBlock } from './EffectsBlock'

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.effects
})

describe('EffectsBlock', () => {
  it('saves the chosen strength and marks the page so the styles can tone the effects down', () => {
    render(<EffectsBlock />)
    expect(screen.getByRole('button', { name: 'ふつう' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '控えめ' }))
    expect(document.documentElement.dataset.effects).toBe('subtle')
    expect(localStorage.getItem('animax.effects.v1')).toBe('"subtle"')
    fireEvent.click(screen.getByRole('button', { name: 'ふつう' }))
    expect(document.documentElement.dataset.effects).toBeUndefined()
  })
})
