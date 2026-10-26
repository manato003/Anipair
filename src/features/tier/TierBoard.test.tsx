// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LibraryEntry } from '../../lib/annict'
import type { RecordRow } from '../records/recordList'
import { TierSort } from './TierBoard'
import { createTable, viewOf, type TierTable } from './tierList'

afterEach(async () => {
  cleanup()
  await waitFor(() => expect((window.history.state as { anipairSheet?: string } | null)?.anipairSheet ?? null).toBeNull())
})

function row(id: number): RecordRow {
  const entry: LibraryEntry = { workId: `W${id}`, annictId: id, title: `作品${id}`, malAnimeId: String(id + 1000), state: 'WATCHED', stateAt: '2026-09-01T00:00:00Z', seasonYear: 2026, seasonName: 'AUTUMN' }
  return { entry, review: null, cover: null }
}

const rows = [row(1), row(2), row(3)]
let latest: TierTable

// 置いた結果を表に返す（TierView と同じく、表が変わると view も変わる）
function Harness() {
  const [table, setTable] = useState(() => createTable(rows, { id: 't1', title: '表', scope: { kind: 'all' }, includeDropped: false, count: 4 }))
  const change = (next: TierTable) => {
    latest = next
    setTable(next)
  }
  return <TierSort table={table} view={viewOf(table, rows)} active onChange={change} onClose={() => {}} />
}

const current = () => screen.getByText(/^作品\d$/, { selector: '.tiersort__name' }).textContent
const undo = () => screen.getByRole('button', { name: 'ひとつ戻る' })

describe('TierSort', () => {
  it('置いた作品に「ひとつ戻る」で戻り、段から外す', () => {
    render(<Harness />)
    expect(undo()).toHaveProperty('disabled', true)
    expect(current()).toBe('作品1')
    fireEvent.click(screen.getByRole('button', { name: 'S' }))
    expect(current()).toBe('作品2')
    expect(latest.tiers[0].items).toEqual([1])
    fireEvent.click(undo())
    expect(current()).toBe('作品1')
    expect(latest.tiers[0].items).toEqual([])
    expect(screen.getByText('残り 3')).toBeTruthy()
    expect(undo()).toHaveProperty('disabled', true)
  })

  it('「あとで」も戻せる。すべて置いた後からも戻れる', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'あとで' }))
    expect(current()).toBe('作品2')
    fireEvent.click(undo())
    expect(current()).toBe('作品1')
    for (const name of ['S', 'A', 'B']) fireEvent.click(screen.getByRole('button', { name }))
    expect(screen.getByText('すべて置きました')).toBeTruthy()
    fireEvent.click(undo())
    expect(current()).toBe('作品3')
    expect(latest.tiers.map((t) => t.items)).toEqual([[1], [2], [], []])
  })

  it('「表に入れない」で次へ進み、「ひとつ戻る」で表に戻す', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '表に入れない' }))
    expect(current()).toBe('作品2')
    expect(latest.excluded).toEqual([1])
    expect(screen.getByText('残り 2')).toBeTruthy()
    fireEvent.click(undo())
    expect(current()).toBe('作品1')
    expect(latest).not.toHaveProperty('excluded')
  })
})
