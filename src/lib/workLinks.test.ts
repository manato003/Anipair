import { describe, expect, it } from 'vitest'
import { linksFrom, parentIds, parseStoredLinks, type Entity } from './workLinks'

const item = (o: { ja?: string; site?: string[]; x?: string[]; series?: string[]; basedOn?: string[] }): Entity => ({
  sitelinks: o.ja ? { jawiki: { title: o.ja } } : {},
  claims: {
    P856: (o.site ?? []).map((v) => ({ mainsnak: { datavalue: { value: v } } })),
    P2002: (o.x ?? []).map((v) => ({ mainsnak: { datavalue: { value: v } } })),
    P179: (o.series ?? []).map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    P144: (o.basedOn ?? []).map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
  },
})

describe('parentIds', () => {
  it('follows the series before the original work and skips the items found by the MyAnimeList id', () => {
    const own = [
      { id: 'Q1', entity: item({ series: ['Q2'], basedOn: ['Q3'] }) },
      { id: 'Q2', entity: item({ basedOn: ['Q3'] }) },
    ]
    expect(parentIds(own)).toEqual(['Q3'])
    expect(parentIds([{ id: 'Q1', entity: item({ basedOn: ['Q3'], series: ['Q2'] }) }])).toEqual(['Q2', 'Q3'])
  })
})

describe('linksFrom', () => {
  it('lists articles of the anime first, then of its series or original work', () => {
    const links = linksFrom([item({ ja: '葬送のフリーレン (アニメ)' })], [item({ ja: '葬送のフリーレン' })])
    expect(links.wikipedia).toEqual([
      `https://ja.wikipedia.org/wiki/${encodeURIComponent('葬送のフリーレン_(アニメ)')}`,
      `https://ja.wikipedia.org/wiki/${encodeURIComponent('葬送のフリーレン')}`,
    ])
  })

  it('uses the site and X account of the anime itself, falling back to the parent, and prefers https', () => {
    expect(linksFrom([item({ site: ['http://a.example/', 'https://b.example/'], x: ['anime_a'] })], [item({ site: ['https://c.example/'], x: ['c'] })])).toMatchObject({
      official: 'https://b.example/',
      x: 'anime_a',
    })
    expect(linksFrom([item({})], [item({ site: ['https://c.example/'], x: ['c'] })])).toMatchObject({ official: 'https://c.example/', x: 'c' })
  })

  it('drops links that are not web pages or valid X names', () => {
    expect(linksFrom([item({ site: ['javascript:alert(1)'], x: ['bad name!'] })], [])).toEqual({ wikipedia: [], official: null, x: null })
  })
})

describe('parseStoredLinks', () => {
  it('keeps only Japanese Wikipedia articles and web pages', () => {
    const at = '2026-10-26T00:00:00.000Z'
    expect(parseStoredLinks({ at, v: { wikipedia: ['https://ja.wikipedia.org/wiki/A', 'https://evil.example/'], official: 'javascript:x', x: 'ok_1' } })).toEqual({
      at,
      v: { wikipedia: ['https://ja.wikipedia.org/wiki/A'], official: null, x: 'ok_1' },
    })
    expect(parseStoredLinks({ at: 'nope', v: {} })).toBeNull()
  })
})
