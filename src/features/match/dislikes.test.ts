import { describe, expect, it } from 'vitest'
import type { Media } from '../../lib/shikimori'
import { DISLIKE_GENRES, DISLIKE_TOPICS, activeKeys, activePeople, makeDislikeTest, mergeDislikes, parseDislikes, sameDislikes, serializeDislikes, studioTarget, topicOfGenre, type Dislikes } from './dislikes'

function media(extra: Partial<Media> = {}): Media {
  return {
    idMal: 1,
    title: { native: '作品', romaji: null, english: null },
    format: 'TV',
    status: 'FINISHED',
    isAdult: false,
    seasonYear: 2020,
    genres: [],
    themes: [],
    demographics: [],
    studios: [],
    cover: null,
    score: null,
    prequels: [],
    related: [],
    ...extra,
  }
}

const at = '2026-10-29T01:00:00.000Z'
const on = (...keys: string[]): Dislikes => new Map(keys.map((k) => [k, { at, active: true }]))

describe('makeDislikeTest', () => {
  it('returns null when nothing is picked', () => {
    expect(makeDislikeTest(new Map())).toBeNull()
    expect(makeDislikeTest(new Map([['topic:ecchi', { at, active: false }]]))).toBeNull()
  })

  it('matches any genre, theme or demographic in a bundled topic', () => {
    const test = makeDislikeTest(on('topic:daily', 'topic:female'))!
    // 日常は Slice of Life でなく CGDCT や Iyashikei だけのことがある
    expect(test(media({ themes: ['CGDCT'] }))).toBe(true)
    expect(test(media({ themes: ['Iyashikei'] }))).toBe(true)
    expect(test(media({ demographics: ['Josei'] }))).toBe(true)
    expect(test(media({ genres: ['Action'], demographics: ['Shounen'] }))).toBe(false)
  })

  it('catches Yaoi / Yuri works that lack the Boys Love / Girls Love genre', () => {
    const test = makeDislikeTest(on('topic:blgl'))!
    expect(test(media({ genres: ['Yaoi'] }))).toBe(true)
  })

  it('does not use the age rating for ecchi', () => {
    const test = makeDislikeTest(on('topic:ecchi'))!
    expect(test(media({ genres: ['Ecchi'] }))).toBe(true)
    // r_plus は Media に入らず、ジャンルが無ければ当たらない
    expect(test(media({ genres: ['Drama', 'Psychological'] }))).toBe(false)
  })

  it('judges short and long works by length, leaving unknown lengths alone', () => {
    const short = makeDislikeTest(on('topic:short'))!
    expect(short(media({ duration: 3 }))).toBe(true)
    expect(short(media({ duration: 24 }))).toBe(false)
    expect(short(media({ duration: 0 }))).toBe(false)
    const long = makeDislikeTest(on('topic:long'))!
    expect(long(media({ episodes: 50 }))).toBe(true)
    // 放送中で全話数が分からない長い作品も、放送済みの話数で当てる
    expect(long(media({ episodes: 0, episodesAired: 1100 }))).toBe(true)
    expect(long(media({ episodes: 12 }))).toBe(false)
    expect(long(media({}))).toBe(false)
  })

  it('matches a known studio by its Shikimori ID, and by its English name when the ID is missing', () => {
    const test = makeDislikeTest(on('studio:569'))!
    expect(test(media({ studioRefs: [{ id: 569, name: 'MAPPA' }], studios: ['MAPPA'] }))).toBe(true)
    expect(test(media({ studios: ['MAPPA'] }))).toBe(true)
    expect(test(media({ studioRefs: [{ id: 2, name: 'Kyoto Animation' }], studios: ['Kyoto Animation'] }))).toBe(false)
  })

  it('matches a searched studio by its name key only when it is exactly the same', () => {
    const test = makeDislikeTest(on('studio:n:studiobind'))!
    expect(test(media({ studios: ['Studio Bind'] }))).toBe(true)
    expect(test(media({ studios: ['Studio Bindings'] }))).toBe(false)
  })
})

describe('studioTarget', () => {
  it('uses the Shikimori ID for well-known studios, even with a Japanese-only name', () => {
    expect(studioTarget({ annictId: 337, name: 'スタジオジブリ', nameEn: null })).toEqual({ id: 'studio:21', shikimoriId: 21 })
  })

  it('falls back to the English name, or to an ASCII-only name', () => {
    expect(studioTarget({ annictId: 99999, name: '何かのスタジオ', nameEn: 'Some Studio' })).toEqual({ id: 'studio:n:somestudio', nameKey: 'somestudio' })
    expect(studioTarget({ annictId: 99998, name: 'NEW STUDIO', nameEn: null })).toEqual({ id: 'studio:n:newstudio', nameKey: 'newstudio' })
  })

  it('cannot match a Japanese-only name outside the known list', () => {
    expect(studioTarget({ annictId: 99997, name: 'どこかの会社', nameEn: null })).toBeNull()
  })
})

describe('parseDislikes / serializeDislikes', () => {
  it('round-trips and keeps names for studios and people', () => {
    const d: Dislikes = new Map([
      ['topic:ecchi', { at, active: true }],
      ['person:123', { at, active: false, name: '名前' }],
    ])
    const back = parseDislikes(JSON.parse(JSON.stringify(serializeDislikes(d))))
    expect(sameDislikes(back, d)).toBe(true)
  })

  it('drops unknown topics, malformed keys, bad dates and trims long names', () => {
    const parsed = parseDislikes({
      version: 1,
      items: {
        'topic:nope': { at, active: true },
        'person:abc': { at, active: true },
        'studio:n:<b>': { at, active: true },
        'topic:harem': { at: 'yesterday', active: true },
        'studio:44': { at, active: true, name: 'x'.repeat(300) },
      },
    })
    expect([...parsed.keys()]).toEqual(['studio:44'])
    expect(parsed.get('studio:44')!.name).toHaveLength(100)
  })

  it('returns empty for broken values', () => {
    expect(parseDislikes(null).size).toBe(0)
    expect(parseDislikes({ items: [] }).size).toBe(0)
  })
})

describe('mergeDislikes', () => {
  it('takes the newer change for each item, including turning one off', () => {
    const a: Dislikes = new Map([['topic:ecchi', { at: '2026-10-29T01:00:00Z', active: true }]])
    const b: Dislikes = new Map([
      ['topic:ecchi', { at: '2026-10-29T02:00:00Z', active: false }],
      ['topic:harem', { at: '2026-10-29T00:00:00Z', active: true }],
    ])
    const merged = mergeDislikes(a, b)
    expect(activeKeys(merged)).toEqual(['topic:harem'])
    expect(mergeDislikes(b, a).get('topic:ecchi')!.active).toBe(false)
  })
})

describe('activePeople', () => {
  it('lists people being avoided with their names', () => {
    const d: Dislikes = new Map([
      ['person:5', { at, active: true, name: '悠木碧' }],
      ['person:6', { at, active: false, name: '別の人' }],
      ['studio:2', { at, active: true }],
    ])
    expect(activePeople(d)).toEqual([{ id: 5, name: '悠木碧' }])
  })
})

describe('DISLIKE_TOPICS', () => {
  it('has unique IDs and a collateral number for each', () => {
    const ids = DISLIKE_TOPICS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const d of DISLIKE_TOPICS) {
      expect(d.loss).toBeGreaterThanOrEqual(0)
      expect(Boolean(d.names?.length) || Boolean(d.test)).toBe(true)
    }
  })
})

describe('DISLIKE_GENRES', () => {
  it('lists genres with safe, unique keys, leaving out adult genres and Award Winning', () => {
    const keys = DISLIKE_GENRES.map((g) => g.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.every((k) => /^genre:[a-z0-9]+$/.test(k))).toBe(true)
    expect(DISLIKE_GENRES.find((g) => g.name === 'Mahou Shoujo')?.key).toBe('genre:mahoushoujo')
    expect(DISLIKE_GENRES.some((g) => ['Hentai', 'Erotica', 'Award Winning'].includes(g.name))).toBe(false)
  })

  it('finds the bundled topic that already covers a genre', () => {
    expect(topicOfGenre('Love Polygon')?.id).toBe('romance')
    expect(topicOfGenre('Vampire')).toBeUndefined()
  })

  it('leaves out works with an added genre, and keeps it through save and load', () => {
    const test = makeDislikeTest(on('genre:vampire'))!
    expect(test(media({ themes: ['Vampire'] }))).toBe(true)
    expect(test(media({ themes: ['Survival'] }))).toBe(false)
    const back = parseDislikes(serializeDislikes(on('genre:vampire')))
    expect([...back.keys()]).toEqual(['genre:vampire'])
  })

  it('drops genre keys it does not know', () => {
    const d = parseDislikes({ version: 1, items: { 'genre:nosuchgenre': { at, active: true }, 'genre:Bad Key': { at, active: true } } })
    expect(d.size).toBe(0)
  })
})
