import { useEffect, useState } from 'react'
import type { AnnictSeries, StatusState } from '../../lib/annict'
import { t } from '../../lib/i18n'
import { shikiTitle, workTitle } from '../../lib/names'
import { fetchMedia, type Media } from '../../lib/shikimori'
import { STATUS_LABEL, workMeta } from './detail'
import type { RelatedTarget } from './RelatedDetail'

// 作品の詳細の「関連作品」。Annict のシリーズ（利用者が整理した、同じシリーズの作品の一覧）を放送時期の順に出す。
// Annict にシリーズが無い作品だけ、Shikimori の関連作品（関係の種類つき）で代わりに出す。
// シリーズは広いこともある（「科学アドベンチャー」のように、話のつながらない作品をまとめたもの）が、そのまま見せる。
// 題名を押すと、アプリの中でその作品の詳細を重ねて開く（Annict のサイトへは移らない）

// 長いシリーズは最初はこの件数まで（「すべて表示」で広げる）
const FOLD_AT = 8

// Shikimori の relationKind の名前（画面の言語で）。無いものは「関連」
function relationName(kind: string): string {
  switch (kind) {
    case 'prequel':
      return t('前作', 'Prequel')
    case 'sequel':
      return t('続編', 'Sequel')
    case 'parent_story':
      return t('本編', 'Main story')
    case 'side_story':
      return t('外伝', 'Side story')
    case 'spin_off':
      return t('スピンオフ', 'Spin-off')
    case 'alternative_version':
      return t('別バージョン', 'Alternative version')
    case 'alternative_setting':
      return t('別の舞台', 'Alternative setting')
    case 'summary':
      return t('総集編', 'Recap')
    case 'full_story':
      return t('完全版', 'Full story')
    case 'character':
      return t('同じキャラクター', 'Same characters')
    default:
      return t('関連', 'Related')
  }
}

// 代わりの一覧の並び順（関係の近いものから）
const RELATION_ORDER = ['prequel', 'sequel', 'parent_story', 'side_story', 'spin_off', 'alternative_version', 'alternative_setting', 'full_story', 'summary', 'character']

const NOISE_FORMATS = new Set(['PV', 'CM', 'MUSIC'])

// Shikimori の作品の形式の名前（画面の言語で）。知らない形式はそのまま
function formatName(format: string): string {
  switch (format) {
    case 'MOVIE':
      return t('劇場版', 'Movie')
    case 'ONA':
      return t('配信', 'ONA')
    case 'TV_SPECIAL':
    case 'SPECIAL':
      return t('特番', 'Special')
    case 'MUSIC':
      return 'MV'
    default:
      return format
  }
}

export function RelatedWorks(props: {
  annictId: number
  series: AnnictSeries[] | null
  shiki: Media | null
  // 関連作品のシートで変えた状態（作品の ID ごと。null は記録から外した）。一覧の印に、すぐ映す
  states?: ReadonlyMap<number, StatusState | null>
  onOpen: (target: RelatedTarget) => void
}) {
  // series が null のあいだは、Annict の詳細を読み込み中（代わりの一覧も出さない。シリーズがあるかどうかがまだ分からない）
  if (props.series === null) return null
  if (props.series.length > 0) {
    return (
      <section className="detail__section related">
        <h3 className="detail__label">{t('関連作品', 'Related anime')}</h3>
        {props.series.map((s) => (
          <SeriesList key={s.name} series={s} current={props.annictId} states={props.states} onOpen={props.onOpen} />
        ))}
      </section>
    )
  }
  return <ShikimoriRelated shiki={props.shiki} onOpen={props.onOpen} />
}

function SeriesList({
  series,
  current,
  states,
  onOpen,
}: {
  series: AnnictSeries
  current: number
  states?: ReadonlyMap<number, StatusState | null>
  onOpen: (target: RelatedTarget) => void
}) {
  const [open, setOpen] = useState(false)
  const long = series.works.length > FOLD_AT
  // 畳んでいるときも、いま開いている作品は必ず見えるようにする（前後を含めて FOLD_AT 件の窓）
  const at = Math.max(0, series.works.findIndex((w) => w.annictId === current))
  const start = long && !open ? Math.min(Math.max(0, at - Math.floor(FOLD_AT / 2)), series.works.length - FOLD_AT) : 0
  const shown = long && !open ? series.works.slice(start, start + FOLD_AT) : series.works
  return (
    <div className="related__series">
      <p className="related__name">
        {t('シリーズ「', 'Series “')}
        {series.name}
        {t('」', '”')}
        <span className="related__count">{t(`${series.works.length}作品`, `${series.works.length} anime`)}</span>
      </p>
      <ol className="related__list">
        {shown.map((w) => {
          const here = w.annictId === current
          const raw = states?.has(w.annictId) ? states.get(w.annictId) : w.viewerStatusState
          const state = raw && raw !== 'NO_STATE' ? STATUS_LABEL[raw] : null
          return (
            <li key={w.id} className={here ? 'related__item related__item--current' : 'related__item'} aria-current={here ? 'true' : undefined}>
              <span className="related__body">
                {here ? (
                  <span className="related__title">{workTitle(w)}</span>
                ) : (
                  <button type="button" className="related__title related__open" onClick={() => onOpen({ kind: 'annict', work: { ...w, viewerStatusState: raw ?? null } })}>
                    {workTitle(w)}
                  </button>
                )}
                <span className="related__meta">
                  {(here || w.summary) && <span className="related__tag">{here ? t('この作品', 'This anime') : w.summary}</span>}
                  {workMeta(w)}
                </span>
              </span>
              {state && <span className="badge badge--state">{state}</span>}
            </li>
          )
        })}
      </ol>
      {long && (
        <button type="button" className="link related__more" onClick={() => setOpen((v) => !v)}>
          {open ? t('一部だけ表示', 'Show fewer') : t(`すべて表示（${series.works.length}作品）`, `Show all (${series.works.length} anime)`)}
        </button>
      )}
    </div>
  )
}

// Annict にシリーズが無いときの代わり。Shikimori の関連作品の題名などを、まとめて1回で引く
function ShikimoriRelated({ shiki, onOpen }: { shiki: Media | null; onOpen: (target: RelatedTarget) => void }) {
  const related = shiki?.related ?? []
  const key = related.map((r) => r.malId).join(',')
  const [media, setMedia] = useState<{ key: string; map: Map<number, Media> } | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    fetchMedia(key.split(',').map(Number)).then(
      (map) => !cancelled && setMedia({ key, map }),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [key])
  if (!key || media?.key !== key) return null
  const rank = (k: string) => {
    const i = RELATION_ORDER.indexOf(k)
    return i < 0 ? RELATION_ORDER.length : i
  }
  const items = related
    .flatMap((r) => {
      const m = media.map.get(r.malId)
      // PV・CM・MV は関連作品として見る意味が薄いので出さない
      return m && !NOISE_FORMATS.has(m.format ?? '') ? [{ ...r, media: m }] : []
    })
    .sort((a, b) => rank(a.kind) - rank(b.kind) || (a.media.seasonYear ?? 9999) - (b.media.seasonYear ?? 9999))
  if (items.length === 0) return null
  return (
    <section className="detail__section related">
      <h3 className="detail__label">{t('関連作品', 'Related anime')}</h3>
      <ol className="related__list">
        {items.map((r) => {
          const title = shikiTitle(r.media.title, `MAL ${r.malId}`)
          const meta = [r.media.seasonYear ? t(`${r.media.seasonYear}年`, `${r.media.seasonYear}`) : null, r.media.format ? formatName(r.media.format) : null].filter(Boolean).join(' ')
          return (
            <li key={`${r.kind}-${r.malId}`} className="related__item">
              <span className="related__body">
                <button type="button" className="related__title related__open" onClick={() => onOpen({ kind: 'shiki', media: r.media })}>
                  {title}
                </button>
                <span className="related__meta">
                  <span className="related__tag">{relationName(r.kind)}</span>
                  {meta}
                </span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="detail__source">{t('関連作品はShikimoriの情報です。', 'Related anime data is from Shikimori.')}</p>
    </section>
  )
}
