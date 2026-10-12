import { describe, expect, it } from 'vitest'
import { analyticsEnabled, screenPath, withoutQuery } from './analytics'

describe('analytics', () => {
  it('sends only from the deployments on Vercel, not from local development', () => {
    expect(analyticsEnabled('anipair.vercel.app')).toBe(true)
    expect(analyticsEnabled('animax-git-preview-manatemis-5508s-projects.vercel.app')).toBe(true)
    expect(analyticsEnabled('localhost')).toBe(false)
    expect(analyticsEnabled('127.0.0.1')).toBe(false)
  })

  it('names the screen by its tab, and the first screen before login as welcome', () => {
    expect(screenPath('rate', true)).toBe('/rate')
    expect(screenPath('settings', true)).toBe('/settings')
    expect(screenPath('settings', false)).toBe('/welcome')
  })

  it('drops the query and the hash, so the Annict authorization code never leaves the page', () => {
    expect(withoutQuery({ type: 'pageview', url: 'https://anipair.vercel.app/rate?code=secret&state=x#top' })).toEqual({
      type: 'pageview',
      url: 'https://anipair.vercel.app/rate',
    })
    expect(withoutQuery({ type: 'pageview', url: 'not a url' })).toEqual({ type: 'pageview', url: 'not a url' })
  })
})
