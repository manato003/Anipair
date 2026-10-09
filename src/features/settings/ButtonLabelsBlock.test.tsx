// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ButtonLabelsBlock } from './ButtonLabelsBlock'

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.buttons
})

describe('ButtonLabelsBlock', () => {
  it('saves the choice and marks the page so the styles can hide the icons or the names', () => {
    render(<ButtonLabelsBlock />)
    expect(screen.getByRole('button', { name: 'アイコンと名前' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'アイコンだけ' }))
    expect(document.documentElement.dataset.buttons).toBe('icon')
    expect(localStorage.getItem('animax.buttonLabels.v1')).toBe('"icon"')
    fireEvent.click(screen.getByRole('button', { name: '名前だけ' }))
    expect(document.documentElement.dataset.buttons).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: 'アイコンと名前' }))
    expect(document.documentElement.dataset.buttons).toBeUndefined()
  })

  it('starts from the saved choice', () => {
    localStorage.setItem('animax.buttonLabels.v1', '"text"')
    render(<ButtonLabelsBlock />)
    expect(screen.getByRole('button', { name: '名前だけ' }).getAttribute('aria-pressed')).toBe('true')
  })
})
