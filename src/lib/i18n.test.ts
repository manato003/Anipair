import { describe, expect, it } from 'vitest'
import { detectLang, pick } from './i18n'

describe('detectLang', () => {
  it('uses Japanese for a Japanese browser, English for anything else', () => {
    expect(detectLang(['ja-JP', 'en-US'])).toBe('ja')
    expect(detectLang(['ja'])).toBe('ja')
    expect(detectLang(['en-US', 'ja-JP'])).toBe('en')
    expect(detectLang(['fr-FR'])).toBe('en')
  })

  it('falls back to Japanese when the browser gives no language', () => {
    expect(detectLang([])).toBe('ja')
  })
})

describe('pick', () => {
  it('picks the text for the language', () => {
    expect(pick('ja', '日本語', 'English')).toBe('日本語')
    expect(pick('en', '日本語', 'English')).toBe('English')
  })
})
