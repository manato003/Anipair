// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { clearDraft, loadDraft, parseDrafts, saveDraft } from './reviewDrafts'

const axes = { ratingStoryState: 'GREAT' as const, ratingAnimationState: null, ratingMusicState: null, ratingCharacterState: null }

beforeEach(() => {
  localStorage.clear()
})

describe('reviewDrafts', () => {
  it('saves, loads and clears a draft per work', () => {
    saveDraft(10, { axes, body: '途中まで' })
    expect(loadDraft(10)).toMatchObject({ axes, body: '途中まで' })
    expect(loadDraft(11)).toBeNull()
    clearDraft(10)
    expect(loadDraft(10)).toBeNull()
  })

  it('drops broken entries but keeps the rest', () => {
    const ok = { axes, body: 'x', at: '2026-10-05T00:00:00Z' }
    const map = parseDrafts({ '1': ok, '2': { ...ok, axes: { ...axes, ratingStoryState: 'WOW' } }, abc: ok, '3': { body: 'no axes' } })
    expect([...map.keys()]).toEqual([1])
    expect(parseDrafts('broken').size).toBe(0)
  })

  it('keeps at most 50 drafts, dropping the oldest', () => {
    for (let i = 1; i <= 51; i++) saveDraft(i, { axes, body: String(i) })
    expect(loadDraft(51)).not.toBeNull()
    expect(parseDrafts(JSON.parse(localStorage.getItem('animax.reviewDrafts.v1')!)).size).toBe(50)
  })
})
