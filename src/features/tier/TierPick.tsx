import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChipSection } from '../../components/FilterParts'
import { CoverImage } from '../../components/CoverImage'
import { Spinner } from '../../components/Loading'
import { Sheet } from '../../components/Sheet'
import { browseWorks, type BrowseWork } from '../../lib/annict'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { getLang, t } from '../../lib/i18n'
import { malIdOf } from '../../lib/malId'
import { workTitle } from '../../lib/names'
import { SEASON_NAMES, nextSeason, seasonLabel, seasonNameLabel, seasonOf, seasonOfWork, yearsDescending, type Season, type SeasonName } from '../../lib/season'
import { fetchStudioWorks, type Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { STATUS_LABEL } from '../browse/detail'
import { resolveAnnictWorks } from '../match/resolve'
import { genreName } from '../match/taste'
import { OLDEST_SEASON } from '../rate/queue'
import { toggleIn, type RecordRow } from '../records/recordList'
import { useMediaInfo } from '../records/useMediaInfo'
import { WORKS_MAX, addWorks, removeWork, type TierTable, type TierWork } from './tierList'
import {
  PICK_GENRES,
  PICK_STUDIOS,
  courSlugs,
  fromMyLists,
  fromStudio,
  genresMatch,
  workOfBrowse,
  workOfRow,
  type PickList,
  type PickOrder,
  type PickPreset,
  type PickStudio,
} from './tierPicking'

// 選んだ表に作品を足すシート。作品名で探すのが基本で、放送時期（クールの から〜まで）・ジャンル・制作会社・人気の順・自分のリストは探しやすくするための補い。
// 自分のリストを選べば自分の記録から、制作会社を選べばその会社の作品（Shikimori）から、どちらでもなければ Annict の全作品から出す。
// 行の「＋」で足し（「まだ置いていない」に入る）、「✓」で外す。制作会社の作品は、足すときに Annict の作品に結びつける（MyAnimeList の ID で照合）。
// preset は新しい表を「何の表か」から作ったときの絞り込み（絞り込みを開いた状態で出し、何で絞っているかを見せる）
const DEBOUNCE_MS = 400
const PAGE = 30
const LOCAL_PAGE = 60
// ジャンルで絞るとき、当てはまる作品が足りなければ自動で読み進める Annict のページの数（1回ごと）
const AUTO_PAGES = 5

const LISTS: readonly { id: PickList; label: string; states: readonly string[] }[] = [
  { id: 'watched', get label() { return t('見た', 'Watched') }, states: ['WATCHED'] },
  { id: 'watching', get label() { return t('見てる', 'Watching') }, states: ['WATCHING'] },
  { id: 'wanna', get label() { return t('見たい', 'Want to watch') }, states: ['WANNA_WATCH'] },
  { id: 'stopped', get label() { return t('視聴中断', 'Dropped') }, states: ['ON_HOLD', 'STOP_WATCHING'] },
]

interface Item {
  key: string
  title: string
  // 放送時期（制作会社の作品は年）
  when: string | null
  cover: Cover | null
  // 足せる形の作品（制作会社の作品で自分の記録に無いものは、足すときに Annict で探すので null）
  work: TierWork | null
  // 制作会社の作品（Shikimori）
  media: Media | null
  // この表に入っていれば、その Annict の作品 ID
  addedId: number | null
  state: keyof typeof STATUS_LABEL | null
}

interface Remote {
  // どの条件で読んだか（JSON。条件が変わったら読み直す）
  key: string
  works: BrowseWork[]
  cursor: string | null
  hasNext: boolean
}

export function TierPick(props: {
  token: string
  rows: readonly RecordRow[]
  table: TierTable
  preset?: PickPreset | null
  active: boolean
  onChange: (table: TierTable) => void
  onClose: () => void
}) {
  const { table, preset } = props
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState<Season | null>(preset?.from ?? null)
  const [to, setTo] = useState<Season | null>(preset?.to ?? null)
  const [order, setOrder] = useState<PickOrder>({ by: 'popular', dir: 'DESC' })
  const [lists, setLists] = useState<PickList[]>(preset?.lists ?? [])
  const [genres, setGenres] = useState<string[]>(preset?.genres ?? [])
  const [studioId, setStudioId] = useState<string | null>(preset?.studioId ?? null)
  const [filtersOpen, setFiltersOpen] = useState(!!preset)
  const [shown, setShown] = useState(LOCAL_PAGE)

  useEffect(() => {
    const timer = setTimeout(() => setQ(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // 制作会社の作品は Annict で探してから足すので、その間に足した・外した分を消さないよう、最新の表に足す
  const tableRef = useRef(table)
  useEffect(() => {
    tableRef.current = table
  }, [table])
  const commit = (next: TierTable) => {
    if (next === tableRef.current) return
    tableRef.current = next
    props.onChange(next)
  }

  const latest = useMemo(() => nextSeason(seasonOf(new Date())), [])
  const years = useMemo(() => yearsDescending(OLDEST_SEASON, latest), [latest])
  const own = lists.length > 0
  const studio = PICK_STUDIOS.find((s) => s.id === studioId) ?? null
  const source: 'own' | 'studio' | 'annict' = own ? 'own' : studio ? 'studio' : 'annict'
  const key = source === 'annict' ? JSON.stringify([q, courSlugs(from, to, OLDEST_SEASON, latest), order.by, order.dir]) : null

  // Annict の全作品から（自分のリストも制作会社も選んでいないとき）
  const [remote, setRemote] = useState<Remote | null>(null)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [covers, setCovers] = useState<ReadonlyMap<number, Cover>>(new Map())
  const gen = useRef(0)

  const addCovers = async (list: BrowseWork[]) => {
    setCovers((cur) => new Map([...cur, ...quickCovers(list)]))
    const got = await fetchCovers(list, { onProgress: (part) => setCovers((cur) => new Map([...cur, ...part])) })
    setCovers((cur) => new Map([...cur, ...got]))
  }
  const addCoversRef = useRef(addCovers)
  useEffect(() => {
    addCoversRef.current = addCovers
  })

  const load = async (k: string, after: string | null, prev: BrowseWork[]) => {
    const my = ++gen.current
    const [title, seasons, by, direction] = JSON.parse(k) as [string, string[], PickOrder['by'], PickOrder['dir']]
    try {
      const page = await browseWorks(
        props.token,
        { titles: title ? [title] : undefined, seasons: seasons.length > 0 ? seasons : undefined },
        { after, first: PAGE, order: by === 'season' ? 'SEASON' : 'WATCHERS_COUNT', direction },
      )
      if (my !== gen.current) return
      setRemote({ key: k, works: [...prev, ...page.works], cursor: page.endCursor, hasNext: page.hasNext })
      void addCoversRef.current(page.works)
    } catch (e) {
      if (my === gen.current) setError({ key: k, message: messageOf(e) })
    }
  }
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })
  useEffect(() => {
    if (key !== null) void loadRef.current(key, null, [])
  }, [key])

  const more = async () => {
    if (!remote || !remote.cursor) return
    setMoreLoading(true)
    await load(remote.key, remote.cursor, remote.works)
    setMoreLoading(false)
  }

  // 制作会社の作品（Shikimori。会社ごとに新しい順で最大200作品）
  const [studioData, setStudioData] = useState<{ id: string; works: Media[] } | null>(null)
  const [studioError, setStudioError] = useState<{ id: string; message: string } | null>(null)
  const studioGen = useRef(0)
  const loadStudio = async (s: PickStudio) => {
    const my = ++studioGen.current
    try {
      const parts = await Promise.all(s.ids.map((id) => fetchStudioWorks(id)))
      if (my !== studioGen.current) return
      const seen = new Set<number>()
      const works = parts.flat().filter((m) => !seen.has(m.idMal) && !!seen.add(m.idMal))
      setStudioData({ id: s.id, works })
    } catch (e) {
      if (my === studioGen.current) setStudioError({ id: s.id, message: messageOf(e) })
    }
  }
  const loadStudioRef = useRef(loadStudio)
  useEffect(() => {
    loadStudioRef.current = loadStudio
  })
  const studioKey = source === 'studio' ? studioId : null
  useEffect(() => {
    const s = PICK_STUDIOS.find((x) => x.id === studioKey)
    if (s) void loadStudioRef.current(s)
  }, [studioKey])

  // ジャンル・制作会社で絞るための作品情報（Shikimori）。自分のリストは選んだリストの作品、Annict の全作品は読んだ分
  const listRows = useMemo(() => {
    const states = new Set(LISTS.filter((l) => lists.includes(l.id)).flatMap((l) => l.states))
    return props.rows.filter((r) => states.has(r.entry.state))
  }, [props.rows, lists])
  const listEntries = useMemo(() => listRows.map((r) => r.entry), [listRows])
  const infoWorks = source === 'own' ? listEntries : source === 'annict' && remote && remote.key === key ? remote.works : null
  const { info, error: infoError } = useMediaInfo(infoWorks, source === 'own' ? genres.length > 0 || !!studio : source === 'annict' && genres.length > 0)

  // Annict の全作品をジャンルで絞るときは、当てはまる作品が want 件に届くまで、1回に AUTO_PAGES ページまで自動で読み進める
  const [want, setWant] = useState(PAGE)
  const autoToken = JSON.stringify([key, genres, want])
  const [auto, setAuto] = useState({ token: '', pages: 0 })
  const autoPages = auto.token === autoToken ? auto.pages : 0
  const remoteMatched =
    source === 'annict' && remote && remote.key === key
      ? genres.length === 0
        ? remote.works
        : info
          ? remote.works.filter((w) => {
              const mal = malIdOf(w)
              return mal !== null && genresMatch(info.get(mal)?.genres, genres)
            })
          : []
      : []
  const needMore =
    source === 'annict' && genres.length > 0 && !!remote && remote.key === key && info !== null && remote.hasNext && remoteMatched.length < want && autoPages < AUTO_PAGES && !moreLoading
  const autoMore = () => {
    setAuto({ token: autoToken, pages: autoPages + 1 })
    void more()
  }
  const autoMoreRef = useRef(autoMore)
  useEffect(() => {
    autoMoreRef.current = autoMore
  })
  useEffect(() => {
    if (needMore) autoMoreRef.current()
  }, [needMore])

  const rowByMal = useMemo(() => new Map(props.rows.flatMap((r) => (r.entry.malAnimeId ? [[r.entry.malAnimeId, r] as const] : []))), [props.rows])
  const stateOf = useMemo(() => new Map(props.rows.map((r) => [r.entry.annictId, r.entry.state])), [props.rows])
  const addedIds = new Set((table.works ?? []).map((w) => w.annictId))
  const addedByMal = new Map((table.works ?? []).flatMap((w) => (w.malAnimeId ? [[w.malAnimeId, w.annictId] as const] : [])))

  const ownRows = useMemo(
    () => (source === 'own' ? fromMyLists(props.rows, { lists, query: q, from, to, order, genres, studio, info }) : []),
    [source, props.rows, lists, q, from, to, order, genres, studio, info],
  )
  const studioWorks = useMemo(
    () => (source === 'studio' && studioData && studioData.id === studioId ? fromStudio(studioData.works, { query: q, from, to, order, genres }) : []),
    [source, studioData, studioId, q, from, to, order, genres],
  )

  const ofWork = (work: TierWork, cover: Cover | null): Item => {
    const season = seasonOfWork(work)
    return {
      key: String(work.annictId),
      title: workTitle(work),
      when: season ? seasonLabel(season) : null,
      cover,
      work,
      media: null,
      addedId: addedIds.has(work.annictId) ? work.annictId : null,
      state: stateOf.get(work.annictId) ?? null,
    }
  }
  // 制作会社の作品。自分の記録にある作品は、記録の題名と状態で出し、足すときも記録から足す（Annict で探さない）
  const ofMedia = (m: Media): Item => {
    const mal = String(m.idMal)
    const row = rowByMal.get(mal)
    const name = (getLang() === 'en' ? m.title.english || m.title.romaji : m.title.native) || m.title.romaji || m.title.english || mal
    return {
      key: `mal-${mal}`,
      title: row ? workTitle(row.entry) : name,
      when: m.seasonYear ? t(`${m.seasonYear}年`, String(m.seasonYear)) : null,
      cover: m.cover ?? row?.cover ?? null,
      work: row ? workOfRow(row) : null,
      media: m,
      addedId: addedByMal.get(mal) ?? (row && addedIds.has(row.entry.annictId) ? row.entry.annictId : null),
      state: row?.entry.state ?? null,
    }
  }

  const items: Item[] =
    source === 'own'
      ? ownRows.slice(0, shown).map((r) => ofWork(workOfRow(r), r.cover))
      : source === 'studio'
        ? studioWorks.slice(0, shown).map(ofMedia)
        : remoteMatched.map((w) => ofWork(workOfBrowse(w), covers.get(w.annictId) ?? null))
  const failed =
    source === 'annict' && error && error.key === key
      ? error.message
      : source === 'studio' && studioError && studioError.id === studioId
        ? studioError.message
        : source !== 'studio' && infoError
          ? infoError
          : null
  const searching = source === 'annict' && genres.length > 0 && (info === null || needMore || moreLoading)
  const loading =
    !failed &&
    (source === 'annict'
      ? !remote || remote.key !== key || (searching && items.length === 0)
      : source === 'studio'
        ? !studioData || studioData.id !== studioId
        : (genres.length > 0 || !!studio) && info === null)
  const hasMore = source === 'own' ? ownRows.length > shown : source === 'studio' ? studioWorks.length > shown : !!remote && remote.key === key && remote.hasNext

  // 制作会社の作品を Annict で探しているもの・見つからなかったもの（MyAnimeList の ID）
  const [resolving, setResolving] = useState<ReadonlySet<number>>(new Set())
  const [missing, setMissing] = useState<ReadonlySet<number>>(new Set())
  const [resolveError, setResolveError] = useState<string | null>(null)

  const full = addedIds.size >= WORKS_MAX
  const addable = items.filter((it) => it.addedId === null && !(it.media && (missing.has(it.media.idMal) || resolving.has(it.media.idMal))))

  // 作品を足す（表の上限まで）。制作会社の作品で記録に無いものは、Annict で探して見つかった分だけ足す
  const add = async (list: readonly Item[]) => {
    const room = WORKS_MAX - (tableRef.current.works ?? []).length
    const picked = list.slice(0, Math.max(0, room))
    const ready = picked.flatMap((it) => (it.work ? [it.work] : []))
    if (ready.length > 0) commit(addWorks(tableRef.current, ready))
    const medias = picked.flatMap((it) => (!it.work && it.media ? [it.media] : []))
    if (medias.length === 0) return
    const ids = medias.map((m) => m.idMal)
    setResolveError(null)
    setResolving((cur) => new Set([...cur, ...ids]))
    try {
      const found = await resolveAnnictWorks(props.token, medias)
      const works = medias.flatMap((m) => {
        const w = found.get(m.idMal)
        return w ? [workOfBrowse(w)] : []
      })
      if (works.length > 0) commit(addWorks(tableRef.current, works))
      setMissing((cur) => new Set([...cur, ...ids.filter((id) => !found.has(id))]))
    } catch (e) {
      setResolveError(messageOf(e))
    } finally {
      setResolving((cur) => new Set([...cur].filter((id) => !ids.includes(id))))
    }
  }

  const filterCount = (from ? 1 : 0) + (to ? 1 : 0) + lists.length + genres.length + (studio ? 1 : 0)
  const listNames = LISTS.filter((l) => lists.includes(l.id)).map((l) => l.label)
  const sourceText =
    source === 'own'
      ? t(`${listNames.join('・')}のリストから`, `From ${listNames.join(', ')}`)
      : source === 'studio' && studio
        ? t(`${studio.label}の作品から`, `From ${studio.label} anime`)
        : t('Annictの全作品から', 'From all anime on Annict')

  return (
    <Sheet label={t('作品を足す', 'Add anime')} size="large" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('作品を足す', 'Add anime')}</h2>
      <div className="tierpick__tools">
        <input
          className="search"
          type="search"
          placeholder={t('作品名で探す', 'Search by title')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShown(LOCAL_PAGE)
          }}
          aria-label={t('作品名で探す', 'Search by title')}
        />
        <button type="button" className="btn" aria-expanded={filtersOpen} aria-pressed={filterCount > 0} onClick={() => setFiltersOpen((v) => !v)}>
          {t('絞り込み', 'Filter')}
          {filterCount > 0 && <span className="chip__count">{filterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className="tierpick__filters">
          <section className="filtersheet__group">
            <h3 className="detail__label">{t('放送時期', 'Aired')}</h3>
            <div className="tierpick__cours">
              <CourField label={t('から', 'From')} value={from} years={years} fallback="winter" onChange={setFrom} />
              <CourField label={t('まで', 'To')} value={to} years={years} fallback="autumn" onChange={setTo} />
            </div>
          </section>
          <Fold title={t('ジャンル', 'Genre')} picked={genres.map(genreName)}>
            {PICK_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                className="chip"
                aria-pressed={genres.includes(g)}
                onClick={() => {
                  setGenres(toggleIn(genres, g))
                  setShown(LOCAL_PAGE)
                  setWant(PAGE)
                }}
              >
                {genreName(g)}
              </button>
            ))}
          </Fold>
          <Fold title={t('制作会社', 'Studio')} picked={studio ? [studio.label] : []}>
            {PICK_STUDIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="chip"
                aria-pressed={studioId === s.id}
                onClick={() => {
                  setStudioId((cur) => (cur === s.id ? null : s.id))
                  setShown(LOCAL_PAGE)
                }}
              >
                {s.label}
              </button>
            ))}
          </Fold>
          <ChipSection
            title={t('自分のリストから', 'From my lists')}
            items={LISTS.map((l) => ({ id: l.id, label: l.label, count: props.rows.filter((r) => l.states.includes(r.entry.state)).length }))}
            selected={lists}
            onToggle={(id) => {
              setLists(toggleIn(lists, id))
              setShown(LOCAL_PAGE)
            }}
          />
          {(filterCount > 0 || query) && (
            <button
              type="button"
              className="link"
              onClick={() => {
                setFrom(null)
                setTo(null)
                setLists([])
                setGenres([])
                setStudioId(null)
              }}
            >
              {t('絞り込みを解除', 'Clear filters')}
            </button>
          )}
        </div>
      )}

      <div className="tierpick__bar">
        <span className="note">{sourceText}</span>
        <div className="tierpick__order" role="group" aria-label={t('並べ方', 'Order')}>
          {(['popular', 'season'] as const).map((by) => {
            const on = order.by === by
            const dir = on ? order.dir : 'DESC'
            return (
              <button
                key={by}
                type="button"
                className="chip"
                aria-pressed={on}
                aria-label={on ? t(`${sortName(by)}・${sortDirection(by, dir)}（押すと逆の順）`, `${sortName(by)}, ${sortDirection(by, dir)} (tap to reverse)`) : undefined}
                onClick={() => {
                  setOrder(on ? { by, dir: order.dir === 'DESC' ? 'ASC' : 'DESC' } : { by, dir: 'DESC' })
                  setShown(LOCAL_PAGE)
                  setWant(PAGE)
                }}
              >
                {sortName(by)}
                {/* 押していない方も矢印の幅を取っておく（切り替えのたびにボタンの幅が変わらないように） */}
                <span className={on ? 'sortmark' : 'sortmark sortmark--off'} aria-hidden="true">
                  {dir === 'DESC' ? '↓' : '↑'}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {source === 'studio' && (from || to) && <p className="note">{t('制作会社の作品は、放送時期を年で絞ります。', 'Studio anime are filtered by year.')}</p>}

      {failed && (
        <p className="note" role="alert">
          {t(`作品を読み込めませんでした（${failed}）`, `Couldn’t load anime (${failed})`)}{' '}
          {(source === 'annict' || source === 'studio') && (
            <button
              type="button"
              className="link"
              onClick={() => {
                if (source === 'annict' && key) void load(key, null, [])
                else if (studio) void loadStudio(studio)
              }}
            >
              {t('もう一度', 'Try again')}
            </button>
          )}
        </p>
      )}
      {resolveError && (
        <p className="note" role="alert">
          {t(`Annictで作品を探せませんでした（${resolveError}）`, `Couldn’t look up the anime on Annict (${resolveError})`)}
        </p>
      )}
      {loading && (
        <p className="note tierpick__loading">
          <Spinner />
          {searching ? t('当てはまる作品を探しています', 'Looking for matching anime') : t('読み込み中', 'Loading')}
        </p>
      )}
      {!loading && !failed && items.length === 0 && <p className="note">{t('当てはまる作品がありません。', 'No anime match.')}</p>}

      {items.length > 0 && (
        <>
          {addable.length > 1 && (
            <button type="button" className="link tierpick__all" disabled={full} onClick={() => void add(addable)}>
              {t(`表示中の${addable.length}作品をすべて足す`, `Add all ${addable.length} shown`)}
            </button>
          )}
          <ul className="tierpick__list">
            {items.map((it) => {
              const on = it.addedId !== null
              const busy = !!it.media && resolving.has(it.media.idMal)
              const lost = !on && !!it.media && missing.has(it.media.idMal)
              const sub = [it.when, it.state ? STATUS_LABEL[it.state] : null, lost ? t('Annictで見つかりませんでした', 'Not found on Annict') : null].filter(Boolean).join(' · ')
              return (
                <li key={it.key} className="tierpick__item">
                  <span className="tierpick__cover">{it.cover && <CoverImage cover={it.cover} size="thumb" lazy />}</span>
                  <span className="tierpick__text">
                    <span className="tierpick__name">{it.title}</span>
                    {sub && <span className="tierpick__sub">{sub}</span>}
                  </span>
                  <button
                    type="button"
                    className={on ? 'btn tierpick__add tierpick__add--on' : 'btn tierpick__add'}
                    aria-pressed={on}
                    aria-label={on ? t(`「${it.title}」を表から外す`, `Remove “${it.title}” from the list`) : t(`「${it.title}」を足す`, `Add “${it.title}”`)}
                    disabled={busy || lost || (!on && full)}
                    onClick={() => (it.addedId !== null ? commit(removeWork(tableRef.current, it.addedId)) : void add([it]))}
                  >
                    {busy ? <Spinner /> : on ? '✓' : '＋'}
                  </button>
                </li>
              )
            })}
          </ul>
          {hasMore && (
            <button
              type="button"
              className="btn tierpick__more"
              disabled={moreLoading || searching}
              onClick={() => {
                if (source === 'annict' && genres.length > 0) setWant(remoteMatched.length + PAGE)
                else if (source === 'annict') void more()
                else setShown((n) => n + LOCAL_PAGE)
              }}
            >
              {moreLoading || searching ? <Spinner /> : t('もっと見る', 'Show more')}
            </button>
          )}
        </>
      )}

      <div className="filtersheet__foot">
        <span className="note">
          {full ? t(`表に入れられるのは${WORKS_MAX}作品までです`, `A list holds up to ${WORKS_MAX} anime`) : t(`この表に${addedIds.size}作品`, `${addedIds.size} anime in this list`)}
        </span>
        <button type="button" className="btn btn--primary" onClick={props.onClose}>
          {t('完了', 'Done')}
        </button>
      </div>
    </Sheet>
  )
}

// 並べ方のボタンの名前。向きは押している方のボタンの矢印で示す（読み上げでは向きを言葉で添える）
function sortName(by: PickOrder['by']): string {
  return by === 'season' ? t('新着順', 'Newest') : t('人気順', 'Popular')
}

function sortDirection(by: PickOrder['by'], dir: PickOrder['dir']): string {
  if (by === 'season') return dir === 'DESC' ? t('新しい順', 'newest first') : t('古い順', 'oldest first')
  return dir === 'DESC' ? t('高い順', 'most first') : t('低い順', 'least first')
}

// 押すと開く絞り込みの項目（ジャンル・制作会社。チップが多いので最初は畳み、選んだものを見出しの横に出す）
function Fold(props: { title: string; picked: readonly string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="filtersheet__group">
      <button type="button" className="tierpick__fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="detail__label">{props.title}</span>
        <span className="tierpick__picked">{props.picked.join(t('・', ', '))}</span>
        <span className="tierpick__foldmark" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && <div className="filtersheet__chips">{props.children}</div>}
    </section>
  )
}

// クールを年と季節で選ぶ。年を「指定なし」にすると、そちらの端まで。年を選ぶと季節は fallback（から: 冬・まで: 秋）から始まる
function CourField(props: { label: string; value: Season | null; years: readonly number[]; fallback: SeasonName; onChange: (value: Season | null) => void }) {
  const { value } = props
  return (
    <div className="tierpick__cour">
      <span className="tierpick__courlabel">{props.label}</span>
      <select
        value={value?.year ?? ''}
        onChange={(e) => props.onChange(e.target.value ? { year: Number(e.target.value), name: value?.name ?? props.fallback } : null)}
        aria-label={t(`放送時期（${props.label}）の年`, `Aired (${props.label.toLowerCase()}) year`)}
      >
        <option value="">{t('指定なし', 'Any')}</option>
        {props.years.map((y) => (
          <option key={y} value={y}>
            {t(`${y}年`, String(y))}
          </option>
        ))}
      </select>
      <select
        value={value?.name ?? ''}
        disabled={!value}
        onChange={(e) => value && props.onChange({ year: value.year, name: e.target.value as SeasonName })}
        aria-label={t(`放送時期（${props.label}）の季節`, `Aired (${props.label.toLowerCase()}) season`)}
      >
        {!value && <option value="">—</option>}
        {SEASON_NAMES.map((n) => (
          <option key={n} value={n}>
            {seasonNameLabel(n)}
          </option>
        ))}
      </select>
    </div>
  )
}
