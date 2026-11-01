// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, DEFAULT_THEME, parseTheme, reducedMotion, setViewingSeason, todShade } from './theme'

afterEach(() => {
  setViewingSeason(null)
  const root = document.documentElement
  for (const k of ['scheme', 'season', 'darker', 'hand', 'motion']) delete root.dataset[k]
})

describe('theme', () => {
  it('reads saved choices and falls back to automatic for anything unknown', () => {
    expect(parseTheme(null)).toEqual(DEFAULT_THEME)
    expect(parseTheme({ color: 'summer', brightness: 'darker', tod: false, hand: 'left', motion: 'on' })).toEqual({ brightness: 'darker', tod: false, hand: 'left', motion: 'on' })
    expect(parseTheme({ color: 'pink', brightness: 'night', tod: 'yes', hand: 'both' })).toEqual(DEFAULT_THEME)
  })

  it('keeps those who chose the old night color on the dark background', () => {
    expect(parseTheme({ color: 'night', brightness: 'auto' }).brightness).toBe('dark')
    expect(parseTheme({ color: 'night', brightness: 'light' }).brightness).toBe('dark')
    expect(parseTheme({ color: 'night', brightness: 'darker' }).brightness).toBe('darker')
    expect(parseTheme({ color: 'winter', brightness: 'light' }).brightness).toBe('light')
  })

  it('darkens most late at night, not at all in the daytime', () => {
    expect(todShade(1)).toBe(26)
    expect(todShade(13)).toBe(0)
    expect(todShade(19)).toBe(12)
    expect(todShade(23)).toBe(26)
  })

  it('marks the season being looked at for the mascot, and today otherwise', () => {
    applyTheme(DEFAULT_THEME, new Date(2026, 9, 8))
    expect(document.documentElement.dataset.season).toBe('autumn')
    setViewingSeason('spring')
    expect(document.documentElement.dataset.season).toBe('spring')
  })

  it('draws the moon at the top right in the phase of the day', () => {
    applyTheme(DEFAULT_THEME, new Date(Date.UTC(2024, 3, 12)))
    const waxing = document.documentElement.style.getPropertyValue('--moon')
    applyTheme(DEFAULT_THEME, new Date(Date.UTC(2024, 3, 28)))
    expect(document.documentElement.style.getPropertyValue('--moon')).not.toBe(waxing)
    expect(document.documentElement.style.getPropertyValue('--moon-dawn')).toMatch(/^url\("data:image\/svg\+xml,/)
  })

  it('weakens the time-of-day shade on the light background', () => {
    applyTheme({ ...DEFAULT_THEME, brightness: 'light' }, new Date(2026, 9, 8, 1))
    expect(document.documentElement.style.getPropertyValue('--tod')).toBe(`${26 * 0.4}%`)
    applyTheme({ ...DEFAULT_THEME, brightness: 'dark' }, new Date(2026, 9, 8, 1))
    expect(document.documentElement.style.getPropertyValue('--tod')).toBe('26%')
  })

  it('stops the motion when the device asks (auto), or when chosen, and moves when chosen even if the device asks', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)', addEventListener: () => undefined })) as unknown as typeof window.matchMedia
    try {
      applyTheme(DEFAULT_THEME)
      expect(reducedMotion()).toBe(true)
      applyTheme({ ...DEFAULT_THEME, motion: 'on' })
      expect(reducedMotion()).toBe(false)
    } finally {
      window.matchMedia = original
    }
    applyTheme({ ...DEFAULT_THEME, motion: 'reduce' })
    expect(document.documentElement.dataset.motion).toBe('reduce')
  })
})

