// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'
import { TierSort } from './TierBoard'
import { TierCompare } from './TierCompare'
import { createTable, place, viewOf, type TierTable } from './tierList'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

function row(id: number): RecordRow {
  const entry: LibraryEntry = { workId: `W${id}`, annictId: id, title: `作品${id}`, malAnimeId: String(id + 1000), state: 'WATCHED', stateAt: '2026-09-01T00:00:00Z', seasonYear: 2026, seasonName: 'AUTUMN' }
  return { entry, review: null, cover: null }
}

const rows = [row(1), row(2), row(3), row(4)]
let latest: TierTable

// S に 1・2・3、A に 4 を置いた表
function made(): TierTable {
  let t = createTable(rows, { id: 't1', title: '表', scope: { kind: 'all' }, includeDropped: false, count: 4 })
  for (const id of [1, 2, 3]) t = place(t, id, 0)
  return place(t, 4, 1)
}

function Harness(props: { from: TierTable }) {
  const [table, setTable] = useState(props.from)
  const change = (next: TierTable) => {
    latest = next
    setTable(next)
  }
  return <TierCompare table={table} view={viewOf(table, rows)} active onChange={change} onClose={() => {}} />
}

const cards = () => [...document.querySelectorAll('.tiercmp__card')] as HTMLElement[]
const titles = () => cards().map((c) => c.querySelector('.tiersort__name')?.textContent)
const tierButton = (name: string) => screen.getByText(name, { selector: '.tiercmp__label' }).closest('button')!

// truth の前ほど上として、決め終わるまで答える
function answerAll(truth: readonly string[]) {
  while (cards().length === 2) {
    const [a, b] = titles()
    fireEvent.click(cards()[truth.indexOf(a!) < truth.indexOf(b!) ? 0 : 1])
  }
}

describe('TierCompare', () => {
  it('段を選んで2つずつ答えると、その順に並び、比べた印が付く', () => {
    render(<Harness from={made()} />)
    // A は1本だけなので比べられない
    expect(tierButton('A')).toHaveProperty('disabled', true)
    fireEvent.click(tierButton('S'))
    expect(screen.getByText('どちらの方が好みですか？')).toBeTruthy()
    answerAll(['作品3', '作品1', '作品2'])
    expect(screen.getByText('「S」の順番を決めました')).toBeTruthy()
    expect(latest.tiers[0]).toEqual({ name: 'S', items: [3, 1, 2], ranked: [3, 1, 2] })
    expect(latest.tiers[1].items).toEqual([4])
  })

  it('どちらを左に出すかは毎回の乱数で決める', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9)
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    expect(titles()).toEqual(['作品2', '作品1'])
    cleanup()
    random.mockReturnValue(0.1)
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    expect(titles()).toEqual(['作品1', '作品2'])
  })

  it('「ひとつ戻る」で前の組と表に戻る', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    // 2 を 1 の上にする（1本の位置が決まり、表に書く）
    fireEvent.click(cards()[0])
    expect(latest.tiers[0]).toEqual({ name: 'S', items: [2, 1, 3], ranked: [2, 1] })
    fireEvent.click(screen.getByRole('button', { name: 'ひとつ戻る' }))
    expect(titles()).toEqual(['作品2', '作品1'])
    expect(latest.tiers[0]).toEqual({ name: 'S', items: [1, 2, 3] })
  })

  it('途中で閉じても、次に開くと続きから比べる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    fireEvent.click(cards()[1])
    cleanup()
    render(<Harness from={latest} />)
    expect(screen.getByText('続きから・あと約 2 回')).toBeTruthy()
    fireEvent.click(tierButton('S'))
    expect(titles()).toContain('作品3')
  })

  it('比べている間は×の代わりに「保存して中断」を出し、決めかけの1本も続きから比べる', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const onClose = vi.fn()
    const from = made()
    const { rerender } = render(<TierCompare table={from} view={viewOf(from, rows)} active onChange={(t) => (latest = t)} onClose={onClose} />)
    expect(screen.getByRole('button', { name: '閉じる' })).toBeTruthy()
    fireEvent.click(tierButton('S'))
    expect(screen.queryByRole('button', { name: '閉じる' })).toBeNull()
    // 作品2を作品1の下に入れ（表に書く）、作品3は1回だけ答えて中断する
    fireEvent.click(cards()[1])
    rerender(<TierCompare table={latest} view={viewOf(latest, rows)} active onChange={(t) => (latest = t)} onClose={onClose} />)
    expect(screen.getByText('「S」の順番・あと約 2 回')).toBeTruthy()
    // 作品3を、1つ前に入れた作品2より上にする。次は作品1と比べる
    expect(titles()).toEqual(['作品3', '作品2'])
    fireEvent.click(cards()[0])
    expect(titles()).toEqual(['作品3', '作品1'])
    fireEvent.click(screen.getByRole('button', { name: '保存して中断' }))
    expect(onClose).toHaveBeenCalledOnce()
    cleanup()
    render(<Harness from={latest} />)
    fireEvent.click(tierButton('S'))
    expect(titles()).toEqual(['作品3', '作品1'])
  })

  it('答える前に、次に出るかもしれない作品の表紙を読み込んでおく', () => {
    const loaded: string[] = []
    vi.stubGlobal(
      'Image',
      class {
        set src(url: string) {
          loaded.push(url)
        }
      },
    )
    const covered = rows.map((r) => ({ ...r, cover: { url: `https://example.com/o/${r.entry.annictId}.jpg`, thumb: '', landscape: false } }))
    const table = made()
    render(<TierCompare table={table} view={viewOf(table, covered)} active onChange={() => {}} onClose={() => {}} />)
    fireEvent.click(tierButton('S'))
    // 作品2と作品1を比べている間に、次の組に出る作品3を読んでいる
    expect(loaded).toContain('https://example.com/o/3.jpg')
    vi.unstubAllGlobals()
  })

  it('自分で並べた段は、合っていれば1本につき1回の確かめで済む', () => {
    let asked = 0
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    while (cards().length === 2) {
      const [a, b] = titles()
      fireEvent.click(cards()[a! < b! ? 0 : 1])
      asked++
    }
    expect(asked).toBe(2)
    expect(latest.tiers[0]).toEqual({ name: 'S', items: [1, 2, 3], ranked: [1, 2, 3] })
  })

  it('決め終えた段は「最初から比べ直す」で印を外せる', () => {
    render(<Harness from={made()} />)
    fireEvent.click(tierButton('S'))
    answerAll(['作品1', '作品2', '作品3'])
    fireEvent.click(screen.getByRole('button', { name: '段を選ぶ' }))
    expect(tierButton('S')).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: '最初から比べ直す' }))
    expect(latest.tiers[0]).toEqual({ name: 'S', items: [1, 2, 3] })
    expect(tierButton('S')).toHaveProperty('disabled', false)
  })
})

describe('TierSort の終わり', () => {
  it('2本以上ある段があれば、比べて並べる入口を出す', () => {
    const onCompare = vi.fn()
    const table = createTable(rows.slice(0, 2), { id: 't1', title: '表', scope: { kind: 'all' }, includeDropped: false, count: 4 })
    function Sort() {
      const [t, setT] = useState(table)
      return <TierSort table={t} view={viewOf(t, rows.slice(0, 2))} active onChange={setT} onClose={() => {}} onCompare={onCompare} />
    }
    render(<Sort />)
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    fireEvent.click(screen.getByRole('button', { name: '段の中の順番を比べて決める' }))
    expect(onCompare).toHaveBeenCalledOnce()
  })
})
