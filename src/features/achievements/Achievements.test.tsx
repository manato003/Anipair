// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Achievements as AchievementsData } from './useAchievements'
import { HIDDEN_COUNT, type Title } from './titles'

const title = (id: string, name: string, unlocked: boolean, hidden = false): Title => ({
  id,
  name,
  condition: `${name}の条件`,
  group: hidden ? 'hidden' : 'season',
  rarity: hidden ? 'gold' : 'bronze',
  hidden,
  unlocked,
  progress: unlocked ? null : { value: 1, goal: 4, unit: 'クール' },
})

let data: AchievementsData
vi.mock('./useAchievements', () => ({ useAchievements: () => data }))
const { Achievements } = await import('./Achievements')

const ready = (titles: Title[]): AchievementsData => ({ titles, coverage: new Map(), stats: null, scan: null, ready: true })
const show = () => render(<Achievements token="t" rows={[]} loadError={null} onReload={() => undefined} active />)

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Achievements', () => {
  it('reads the history first, then awakens the unlocked titles once', () => {
    data = { titles: null, coverage: null, stats: null, scan: { done: 3, total: 15 }, ready: false }
    const { rerender } = show()
    expect(screen.getByText('Annict での歩みを読み解いています')).toBeTruthy()
    expect(screen.getByText(/3 \/ 15/)).toBeTruthy()

    data = ready([title('season-full-1', '踏破者', true), title('hidden-dawn', '黎明より記す者', true, true), title('season-full-4', '四季を巡る者', false)])
    rerender(<Achievements token="t" rows={[]} loadError={null} onReload={() => undefined} active />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('封印されし称号が、目覚めた')
    expect(dialog.textContent).toContain('踏破者')
    expect(dialog.textContent).toContain('うち隠し称号 1')
    expect(dialog.textContent).not.toContain('四季を巡る者')
    fireEvent.click(screen.getByRole('button', { name: '受け取る' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    // 次に開いたときは覚醒を出さない
    cleanup()
    show()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says the titles are still asleep when nothing is unlocked yet', () => {
    data = ready([title('season-full-1', '踏破者', false)])
    show()
    expect(screen.getByRole('dialog').textContent).toContain('称号は、まだ眠っている')
  })

  it('raises a title by tapping it, and seals the hidden titles not yet unlocked', () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: true }))
    data = ready([title('season-full-1', '踏破者', true), title('hidden-dawn', '黎明より記す者', true, true)])
    show()
    expect(screen.getByText('手に入れた称号を選ぶと、ここに掲げられます')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^踏破者/ }))
    expect(document.querySelector('.profile__title .plate__name')?.textContent).toBe('踏破者')
    expect(JSON.parse(localStorage.getItem('animax.titles.v1') ?? '{}').equipped).toBe('season-full-1')
    // もう一度押すと外す
    fireEvent.click(screen.getByRole('button', { name: /^踏破者/ }))
    expect(document.querySelector('.profile__title')).toBeNull()
    expect(screen.getAllByLabelText('まだ解放されていない隠し称号')).toHaveLength(HIDDEN_COUNT - 1)
    // 開いた時点で見ていなかった称号には NEW
    expect(screen.getAllByText('NEW')).toHaveLength(2)
  })

  // 2026-10-06 の点検: 称号を掲げると、開いたときの古い内容で保存し直し、見終えた称号に次も NEW が付いていた
  it('raising a title keeps the titles already seen, so NEW is not shown again next time', () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: true }))
    data = ready([title('season-full-1', '踏破者', true), title('season-full-4', '四季を巡る者', true)])
    show()
    expect(screen.getAllByText('NEW')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /^踏破者/ }))
    expect(JSON.parse(localStorage.getItem('animax.titles.v1') ?? '{}').seen).toEqual(['season-full-1', 'season-full-4'])
    cleanup()
    show()
    expect(screen.queryByText('NEW')).toBeNull()
  })

  it('God mode lays out every title as unlocked, and saves nothing', () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: ['season-full-1'], awakened: true }))
    data = ready([title('season-full-1', '踏破者', true), title('season-full-4', '四季を巡る者', false), title('hidden-wanna', '積みの魔王', false, true)])
    show()
    fireEvent.click(screen.getByRole('button', { name: /God モード/ }))
    expect(screen.getByRole('status').textContent).toContain('すべての称号を手に入れた状態')
    // まだの称号も、隠し称号も、押せる（手に入れた）名札で並ぶ
    fireEvent.click(screen.getByRole('button', { name: /^積みの魔王/ }))
    expect(document.querySelector('.profile__title .plate__name')?.textContent).toBe('積みの魔王')
    expect(screen.getByRole('button', { name: /^四季を巡る者/ })).toBeTruthy()
    expect(screen.queryAllByLabelText('まだ解放されていない隠し称号')).toHaveLength(HIDDEN_COUNT - 1)
    expect(JSON.parse(localStorage.getItem('animax.titles.v1') ?? '{}').equipped).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '覚醒をもう一度見る' }))
    expect(screen.getByRole('dialog').textContent).toContain('3 の称号を手に入れました')
    fireEvent.click(screen.getByRole('button', { name: '受け取る' }))
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(document.querySelector('.profile__title')).toBeNull()
  })

  it('shows a special title only to its owner, outside of every count', () => {
    localStorage.setItem('animax.titles.v1', JSON.stringify({ equipped: null, seen: [], awakened: true }))
    const creator: Title = { ...title('special-creator', '記録の世界を創りし者', false, true), group: 'special', rarity: 'origin' }
    data = ready([title('season-full-1', '踏破者', true), creator])
    show()
    expect(screen.queryByText('特別な称号')).toBeNull()
    expect(screen.queryByText('記録の世界を創りし者')).toBeNull()
    expect(document.querySelector('.profile__count')?.textContent).toContain('称号 1 / 1')
    cleanup()

    data = ready([title('season-full-1', '踏破者', true), { ...creator, unlocked: true }])
    show()
    expect(screen.getByText('特別な称号')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^記録の世界を創りし者/ })).toBeTruthy()
    expect(document.querySelector('.profile__count')?.textContent).toContain('称号 1 / 1')
    // 隠し称号の数と枠にも入れない
    expect(screen.getAllByLabelText('まだ解放されていない隠し称号')).toHaveLength(HIDDEN_COUNT)
  })
})
