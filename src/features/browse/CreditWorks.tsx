import { useEffect, useMemo, useState } from 'react'
import { useEnglishPeople } from '../../lib/englishNames'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictCreditUrl, peekLibrary, type Credit } from '../../lib/annict'
import { fetchCharacterNames, fetchGenreWorks, fetchMedia, fetchPersonWorks, fetchStudioWorks, findPerson, type Media } from '../../lib/shikimori'
import { getLang, t } from '../../lib/i18n'
import { personName, shikiTitle } from '../../lib/names'
import { messageOf } from '../../lib/useWriteQueue'
import { FORMAT_LABEL, marksByMal } from './detail'
import { RelatedDetail } from './RelatedDetail'
import { genreName } from '../match/taste'
import type { Enqueue, RelatedChange } from './WorkDetail'
import { Loading } from '../../components/Loading'

// キャスト・スタッフ・制作会社の参加作品。作品の詳細の上に、もう1枚のシートとして重ねて開く（関連作品と同じ）。
// Annict の API には人物・団体の参加作品が無いので（GraphQL・REST とも、キャスト・スタッフは作品からしか引けない）、Shikimori から引く。
// 人物は日本語名で Shikimori の人物を探して照合し、制作会社は作品の Shikimori の制作会社に結びつけたもの（detail.ts の studioFor）。
// 声の出演と、主題歌の歌唱などのスタッフとしての参加は、1つの一覧にまとめて役割の札で分ける（Shikimori は別々に返す）。
// 見つからなければ、行き先を名前に書いた「Annict で見る」だけを出す。作品を押すと、アプリの中でその作品の詳細を重ねて開く。
// ジャンルの札を押したときも同じシートで、Shikimori のそのジャンルの人気の上位の作品を出す（続編は1作目にまとめる）

export type CreditTarget =
  | {
      credit: Credit
      // 制作会社のとき、結びつけた Shikimori の制作会社（結びつけられなければ null）
      studio: { id: number; name: string } | null
    }
  // ジャンル・テーマ（name は Shikimori の英語名、id は Shikimori の ID）
  | { genre: { id: number; name: string } }

// 一覧の1作品と、その人の役割（「フリーレン役」「出演」「主題歌」「監督」など）
interface CreditWork {
  media: Media
  roles: string[]
}

type Found = { kind: 'loading' } | { kind: 'found'; works: CreditWork[] } | { kind: 'missing' } | { kind: 'error'; message: string }

// 並べ方の軸と向き（押している軸をもう一度押すと向きが逆になる。Tier表の作品を足すシートと同じ）
interface Order {
  by: 'newest' | 'popular'
  dir: 'DESC' | 'ASC'
}

// 一覧に出さない形式（宣伝の映像）
const HIDDEN_FORMATS = new Set(['PV', 'CM'])
// 最初に出す件数（多い人は数百ある）
const FIRST = 60

// 放送日順: 放送年の新しい順（逆は古い順。年の分からない作品はどちらでも最後）。人気順: Shikimori でリストに入れている人の多い順（逆は少ない順）
function orderWorks(works: readonly CreditWork[], order: Order): CreditWork[] {
  const sign = order.dir === 'DESC' ? 1 : -1
  return [...works].sort((a, b) => {
    if (order.by === 'popular') return sign * ((b.media.popularity ?? 0) - (a.media.popularity ?? 0) || b.media.idMal - a.media.idMal)
    const ya = a.media.seasonYear
    const yb = b.media.seasonYear
    if (ya == null || yb == null) return (ya == null ? 1 : 0) - (yb == null ? 1 : 0)
    return sign * (yb - ya || b.media.idMal - a.media.idMal)
  })
}

// 並べ方のボタンの名前。向きは押している方のボタンの矢印で示す（読み上げでは向きを言葉で添える）
function sortName(by: Order['by']): string {
  return by === 'newest' ? t('放送日順', 'Air date') : t('人気順', 'Popular')
}

function sortDirection(order: Order): string {
  if (order.by === 'newest') return order.dir === 'DESC' ? t('新しい順', 'newest first') : t('古い順', 'oldest first')
  return order.dir === 'DESC' ? t('多い順', 'most first') : t('少ない順', 'least first')
}

// 成人向けと宣伝の映像は出さない
const shown = (m: Media) => !m.isAdult && !(m.format && HIDDEN_FORMATS.has(m.format))

// 続編は、同じ一覧に前の作品があれば出さない（人気の上位は「2期」「3期」が並びやすい）
function withoutSequels(works: readonly Media[]): Media[] {
  const ids = new Set(works.map((m) => m.idMal))
  return works.filter((m) => !m.prequels.some((p) => ids.has(p)))
}

async function load(target: CreditTarget): Promise<Found> {
  if ('genre' in target) {
    const works = await fetchGenreWorks(target.genre.id)
    return { kind: 'found', works: withoutSequels(works.filter(shown)).map((media) => ({ media, roles: [] })) }
  }
  if (target.credit.kind === 'org') {
    if (!target.studio) return { kind: 'missing' }
    const works = await fetchStudioWorks(target.studio.id)
    return { kind: 'found', works: works.filter(shown).map((media) => ({ media, roles: [] })) }
  }
  const person = await findPerson(target.credit.name)
  if (!person) return { kind: 'missing' }
  const { cast, staff } = await fetchPersonWorks(person.id)
  // 作品の情報と、役名（キャラクターの日本語名）を一緒に引く。日本語名が引けなければローマ字の名前、それも無ければ「出演」
  const [media, japanese] = await Promise.all([
    fetchMedia([...cast.map((c) => c.id), ...staff.map((s) => s.id)]),
    fetchCharacterNames(cast.flatMap((c) => c.characters.map((ch) => ch.id))).catch(() => new Map<number, string>()),
  ])
  // 作品ごとに役割をまとめる（声の出演は役名を先頭に。「フリーレン役」）
  const roles = new Map<number, string[]>()
  for (const c of cast) {
    const names = [...new Set(c.characters.flatMap((ch) => (getLang() === 'en' ? (ch.name ?? japanese.get(ch.id)) : (japanese.get(ch.id) ?? ch.name)) ?? []))]
    const sep = t('、', ', ')
    roles.set(c.id, [names.length > 0 ? t(`${names.join(sep)}役`, `Voice of ${names.join(sep)}`) : t('出演', 'Cast')])
  }
  for (const s of staff) roles.set(s.id, [...new Set([...(roles.get(s.id) ?? []), ...s.roles])])
  const works = [...roles].flatMap(([id, r]) => {
    const m = media.get(id)
    return m && shown(m) ? [{ media: m, roles: r }] : []
  })
  return { kind: 'found', works }
}

export function CreditWorks(
  props: {
    token: string
    target: CreditTarget
    active: boolean
    onClose: () => void
  } & ({ readOnly: true } | { readOnly?: false; enqueue: Enqueue; onChange: RelatedChange }),
) {
  const { target } = props
  const [found, setFound] = useState<Found>({ kind: 'loading' })
  const genre = 'genre' in target ? target.genre : null
  const credit = 'credit' in target ? target.credit : null
  // ジャンルは人気の上位を引いているので、人気順から
  const [order, setOrder] = useState<Order>({ by: genre ? 'popular' : 'newest', dir: 'DESC' })
  const [more, setMore] = useState(false)
  // 一覧から重ねて開いている作品
  const [open, setOpen] = useState<Media | null>(null)

  useEffect(() => {
    let cancelled = false
    load(target).then(
      (f) => !cancelled && setFound(f),
      (e) => !cancelled && setFound({ kind: 'error', message: messageOf(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [target])

  // 自分の記録の印（アプリが最後に読んだライブラリ。MyAnimeList の ID ごと）
  const mine = useMemo(() => marksByMal(peekLibrary()), [])

  const list = useMemo(() => (found.kind === 'found' ? orderWorks(found.works, order) : []), [found, order])
  const visible = more ? list : list.slice(0, FIRST)
  // 英語の画面では、人の英語名を Wikidata から引く（団体は Annict の英語の表記）
  useEnglishPeople(credit?.kind === 'person' ? [credit.name] : [])
  const name = credit ? personName(credit) : genreName(genre?.name ?? '')

  return (
    <>
      <Sheet label={name} size="page" active={props.active && open === null} onClose={props.onClose}>
        <h2 className="detail__title">{name}</h2>
        <p className="detail__meta">
          {genre ? t('このジャンルの人気の作品', 'Popular anime in this genre') : credit?.kind === 'org' ? t('制作した作品', 'Anime produced') : t('参加した作品', 'Anime worked on')}
          {found.kind === 'found' && list.length > 0 && t(`（${list.length}作品）`, ` (${list.length} anime)`)}
        </p>

        {found.kind === 'loading' && (
          <Loading label={genre ? t('作品を検索中', 'Searching for anime') : t('参加作品を検索中', 'Searching for their anime')} />
        )}
        {found.kind === 'error' && <p className="settings__error">{found.message}</p>}
        {(found.kind === 'missing' || (found.kind === 'found' && list.length === 0)) && (
          <div className="detail__section">
            <p className="detail__meta">
              {genre ? t('このジャンルの作品を見つけられませんでした。', 'Couldn’t find any anime in this genre.') : t('参加作品を見つけられませんでした。', 'Couldn’t find any anime for this one.')}
            </p>
            {credit && (
              <a className="detail__source" href={annictCreditUrl(credit)} target="_blank" rel="noreferrer">
                {t('Annictで見る', 'View on Annict')}
              </a>
            )}
          </div>
        )}

        {list.length > 1 && (
          <>
            <div className="toggle toggle--full creditworks__order" role="group" aria-label={t('並べ替え', 'Sort')}>
              {(['newest', 'popular'] as const).map((by) => {
                const on = order.by === by
                const dir = on ? order.dir : 'DESC'
                return (
                  <button
                    key={by}
                    type="button"
                    aria-pressed={on}
                    aria-label={on ? t(`${sortName(by)}・${sortDirection(order)}（押すと逆の順）`, `${sortName(by)}, ${sortDirection(order)} (tap to reverse)`) : undefined}
                    onClick={() => setOrder(on ? { by, dir: order.dir === 'DESC' ? 'ASC' : 'DESC' } : { by, dir: 'DESC' })}
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
          </>
        )}

        {visible.length > 0 && (
          <ul className="creditworks">
            {visible.map(({ media: m, roles }) => {
              const state = mine.get(m.idMal)
              const meta = [m.seasonYear ? t(`${m.seasonYear}年`, `${m.seasonYear}`) : null, m.format ? (FORMAT_LABEL[m.format] ?? null) : null].filter(Boolean).join(' · ')
              return (
                <li key={m.idMal}>
                  <button type="button" className="creditworks__item" onClick={() => setOpen(m)}>
                    <span className="creditworks__cover">{m.cover && <CoverImage cover={m.cover} size="thumb" lazy />}</span>
                    <span className="creditworks__text">
                      <span className="creditworks__title">{shikiTitle(m.title, `MAL ${m.idMal}`)}</span>
                      {meta && <span className="creditworks__meta">{meta}</span>}
                      {roles.length > 0 && <span className="creditworks__roles">{roles.join(t('・', ', '))}</span>}
                    </span>
                    {state && <span className="creditworks__mine">{state}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {!more && list.length > FIRST && (
          <button type="button" className="btn creditworks__more" onClick={() => setMore(true)}>
            {t(`ほかの${list.length - FIRST}作品も見る`, `Show ${list.length - FIRST} more anime`)}
          </button>
        )}
        {found.kind === 'found' && list.length > 0 && <p className="detail__source">{t('作品の一覧はShikimoriの情報です。', 'The anime list is from Shikimori.')}</p>}
      </Sheet>

      {open &&
        (props.readOnly ? (
          <RelatedDetail readOnly token={props.token} target={{ kind: 'shiki', media: open }} active={props.active} onClose={() => setOpen(null)} />
        ) : (
          <RelatedDetail
            token={props.token}
            target={{ kind: 'shiki', media: open }}
            active={props.active}
            enqueue={props.enqueue}
            onChange={props.onChange}
            onClose={() => setOpen(null)}
          />
        ))}
    </>
  )
}
