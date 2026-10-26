// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createTable } from './tierList'
import { loadLocalTiers, newTableId, removeTable, saveTable } from './tierStore'

const table = (id: string) => createTable([], { id, title: id, scope: { kind: 'all' }, includeDropped: false }, new Date('2026-10-25T00:00:00Z'))

describe('tierStore', () => {
  beforeEach(() => localStorage.clear())

  it('表を足し、同じ ID は置き換える', () => {
    saveTable(table('a'))
    saveTable(table('b'))
    saveTable({ ...table('a'), title: '新しい' })
    expect(loadLocalTiers().tables.map((t) => [t.id, t.title])).toEqual([
      ['a', '新しい'],
      ['b', 'b'],
    ])
  })

  it('消すと印を残し、同じ ID で作り直したら印を外す', () => {
    saveTable(table('a'))
    removeTable('a', new Date('2026-10-26T00:00:00Z'))
    expect(loadLocalTiers()).toEqual({ tables: [], removed: [{ id: 'a', at: '2026-10-26T00:00:00.000Z' }] })
    saveTable(table('a'))
    expect(loadLocalTiers().removed).toEqual([])
  })

  it('表の ID は16桁の16進数で、毎回違う', () => {
    const a = newTableId()
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(newTableId()).not.toBe(a)
  })
})
