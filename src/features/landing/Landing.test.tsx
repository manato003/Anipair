// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { resetLangForTests } from '../../lib/i18n'

// 作品の情報は偽物（中継には問い合わせない）。題名は「作品<ID>」、ジャンルはどれも Drama
const fake = (id: number): Media => ({
  idMal: id,
  title: { native: `作品${id}`, romaji: `Work ${id}`, english: null },
  format: 'TV',
  status: 'FINISHED',
  isAdult: false,
  seasonYear: 2023,
  genres: ['Drama'],
  themes: [],
  demographics: [],
  studios: [],
  cover: { url: `https://example.test/o${id}.jpg`, thumb: `https://example.test/m${id}.jpg`, landscape: false },
  score: null,
  prequels: [],
  related: [],
})

vi.mock('../../lib/shikimori', async (orig) => ({
  ...(await orig<typeof import('../../lib/shikimori')>()),
  fetchMedia: vi.fn(async (ids: readonly number[]) => new Map(ids.map((id) => [id, fake(id)]))),
  fetchSimilar: vi.fn(async (id: number) => [id + 900000, id + 900001]),
}))
vi.mock('../../lib/annictLogin', async (orig) => ({
  ...(await orig<typeof import('../../lib/annictLogin')>()),
  startLogin: vi.fn(),
}))

const { fetchMedia, fetchSimilar } = await import('../../lib/shikimori')
const { startLogin } = await import('../../lib/annictLogin')
const { Landing } = await import('./Landing')

function show(over: { clientId?: string | null } = {}) {
  return render(<Landing clientId={over.clientId === undefined ? 'cid' : over.clientId} busy={false} error={null} onAnnictTokenChange={() => {}} />)
}

const card = () => document.getElementById('lp-try')!
const match = () => document.getElementById('lp-match')!
const tier = () => document.getElementById('lp-tier')!

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  resetLangForTests('ja')
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

describe('Landing', () => {
  it('shows the tagline, two login buttons and a quick login link at the top', async () => {
    show()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('あなたの「好き」と、次の「好き」をつなぐ。')
    const buttons = screen.getAllByRole('button', { name: 'Annictでログイン' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    expect(startLogin).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cid' }))
    expect(screen.getByRole('link', { name: 'ログイン' }).getAttribute('href')).toBe('#lp-start')
    await screen.findAllByRole('link', { name: /を評価のカードで出す$/ })
  })

  // 作品の情報は棚とカードの分を1回でまとめて受け取る（Annict には問い合わせない）
  it('loads all demo anime in one request, and puts the anime picked on a shelf on the rating card', async () => {
    show()
    const items = await screen.findAllByRole('link', { name: /を評価のカードで出す$/ })
    expect(fetchMedia).toHaveBeenCalledTimes(1)
    expect(items.length).toBe(36)
    expect(within(card()).getByRole('heading', { level: 3 }).textContent).toBe('作品52991')
    fireEvent.click(screen.getByRole('link', { name: '作品35330を評価のカードで出す' }))
    expect(within(card()).getByRole('heading', { level: 3 }).textContent).toBe('作品35330')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('rating an anime shows it as the last answer, suggests a similar anime with the reason, and lines it up in the Tier list', async () => {
    show()
    await screen.findAllByRole('link', { name: /を評価のカードで出す$/ })
    expect(within(match()).getByText(/1つ付けると、ここに提案が届きます/)).toBeTruthy()
    fireEvent.click(within(card()).getByRole('button', { name: 'とても良い' }))
    expect(within(card()).getByText('答えた数: 1')).toBeTruthy()
    expect(within(card()).getByRole('heading', { level: 3 }).textContent).toBe('作品47917')

    expect(await within(match()).findByText('『作品52991』を「とても良い」にしたから')).toBeTruthy()
    expect(fetchSimilar).toHaveBeenCalledWith(52991)
    expect(within(match()).getByRole('heading', { level: 3 }).textContent).toBe('作品952991')
    expect(within(match()).getByText('ドラマ')).toBeTruthy()
    fireEvent.click(within(match()).getByRole('button', { name: '見たい' }))
    expect(within(match()).getByText(/「見たい」に入れた作品: 作品952991/)).toBeTruthy()
    expect(within(match()).getByRole('heading', { level: 3 }).textContent).toBe('作品952992')
    fireEvent.click(within(match()).getByRole('button', { name: '興味なし' }))
    expect(within(match()).getByText('デモの提案はここまでです')).toBeTruthy()

    // S の段に入り、押すと A の段へ
    const rows = () => [...tier().querySelectorAll('.lp-tier__row')]
    expect(within(rows()[0] as HTMLElement).getByRole('button', { name: '作品52991を下の段へ' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '作品52991を下の段へ' }))
    expect(within(rows()[1] as HTMLElement).getByRole('button', { name: '作品52991を下の段へ' })).toBeTruthy()
  })

  // デモの答えは Annict に送らず、端末にも残さない
  it('keeps the demo answers on the page only', async () => {
    show()
    await screen.findAllByRole('link', { name: /を評価のカードで出す$/ })
    fireEvent.click(within(card()).getByRole('button', { name: 'おまかせで答える' }))
    expect(within(card()).getByText('答えた数: 8')).toBeTruthy()
    expect(localStorage.length).toBe(0)
    fireEvent.click(within(card()).getByRole('button', { name: '最初からやり直す' }))
    expect(within(card()).getByText('答えた数: 0')).toBeTruthy()
  })

  it('says when the anime could not be loaded, and tries again', async () => {
    vi.mocked(fetchMedia).mockRejectedValueOnce(new Error('down'))
    show()
    fireEvent.click(await within(card()).findByRole('button', { name: 'もう一度' }))
    expect(await within(card()).findByRole('heading', { level: 3 })).toBeTruthy()
    expect(fetchMedia).toHaveBeenCalledTimes(2)
  })

  it('without a client id, opens the personal-token form in the last login section', () => {
    show({ clientId: null })
    expect(screen.queryByRole('button', { name: 'Annictでログイン' })).toBeNull()
    const dev = document.querySelector('details.settings__dev') as HTMLDetailsElement
    expect(dev.open).toBe(true)
    expect(dev.closest('#lp-start')).toBeTruthy()
  })

  it('is in English when the language is English', async () => {
    resetLangForTests('en')
    show()
    expect(screen.getAllByRole('button', { name: 'Log in with Annict' })).toHaveLength(2)
    expect(screen.getByText(/Anime titles are shown in romanized Japanese/)).toBeTruthy()
    // 英語の画面では、作品名をローマ字の題名で出す
    expect(await screen.findByRole('link', { name: 'Show Work 52991 on the rating card' })).toBeTruthy()
  })
})
