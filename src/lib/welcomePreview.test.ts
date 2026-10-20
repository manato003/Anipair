import { describe, expect, it } from 'vitest'
import { isWelcomePreview, wantsFirstRun } from './welcomePreview'

describe('isWelcomePreview', () => {
  it('opens the first screen with ?welcome on preview and local hosts', () => {
    expect(isWelcomePreview({ hostname: 'animax-git-preview-x.vercel.app', search: '?welcome' })).toBe(true)
    expect(isWelcomePreview({ hostname: 'localhost', search: '?welcome=1' })).toBe(true)
  })

  it('never on production, and not without ?welcome', () => {
    expect(isWelcomePreview({ hostname: 'anipair.com', search: '?welcome' })).toBe(false)
    expect(isWelcomePreview({ hostname: 'localhost', search: '' })).toBe(false)
  })
})

describe('wantsFirstRun', () => {
  it('shows the first-run hints again with ?firstrun, except on production', () => {
    expect(wantsFirstRun({ hostname: 'animax-git-preview-x.vercel.app', search: '?firstrun' })).toBe(true)
    expect(wantsFirstRun({ hostname: 'anipair.com', search: '?firstrun' })).toBe(false)
    expect(wantsFirstRun({ hostname: 'localhost', search: '?welcome' })).toBe(false)
  })
})
