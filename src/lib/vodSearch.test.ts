import { describe, expect, it } from 'vitest'
import { vodSearchLinks } from './vodSearch'

describe('vodSearchLinks', () => {
  it('puts the title into each service search, encoded', () => {
    const links = vodSearchLinks('葬送のフリーレン 第2期')
    expect(links.map((l) => l.name)).toEqual(['Netflix', 'U-NEXT', 'Prime Video', 'ABEMA', 'dアニメストア', 'ニコニコ'])
    const q = encodeURIComponent('葬送のフリーレン 第2期')
    expect(links[4].href).toBe(`https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey=${q}`)
    expect(links.every((l) => l.href.startsWith('https://') && l.href.includes(q))).toBe(true)
  })

  it('does not let a title break out of the query (& / # ? are encoded)', () => {
    const d = vodSearchLinks('Fate/stay night [Heaven’s Feel] #1 & ?')[4]
    expect(new URL(d.href).searchParams.get('searchKey')).toBe('Fate/stay night [Heaven’s Feel] #1 & ?')
    const nico = vodSearchLinks('a/b?c')[5]
    expect(nico.href).toBe('https://www.nicovideo.jp/search/a%2Fb%3Fc')
  })

  it('returns nothing for an empty title', () => {
    expect(vodSearchLinks('  ')).toEqual([])
  })
})
