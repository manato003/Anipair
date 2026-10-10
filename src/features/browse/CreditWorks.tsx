import { useEffect, useMemo, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictCreditUrl, peekLibrary, type Credit } from '../../lib/annict'
import { fetchCharacterNames, fetchMedia, fetchPersonWorks, fetchStudioWorks, findPerson, type Media } from '../../lib/shikimori'
import { messageOf } from '../../lib/useWriteQueue'
import { FORMAT_LABEL, marksByMal } from './detail'
import { RelatedDetail } from './RelatedDetail'
import type { Enqueue, RelatedChange } from './WorkDetail'
import { Loading } from '../../components/Loading'

// キャスト・スタッフ・制作会社の参加作品。作品の詳細の上に、もう1枚のシートとして重ねて開く（関連作品と同じ）。
// Annict の API には人物・団体の参加作品が無いので（GraphQL・REST とも、キャスト・スタッフは作品からしか引けない）、Shikimori から引く。
// 人物は日本語名で Shikimori の人物を探して照合し、制作会社は作品の Shikimori の制作会社に結びつけたもの（detail.ts の studioFor）。
// 声の出演と、主題歌の歌唱などのスタッフとしての参加は、1つの一覧にまとめて役割の札で分ける（Shikimori は別々に返す）。
// 見つからなければ、行き先を名前に書いた「Annict で見る」だけを出す。作品を押すと、アプリの中でその作品の詳細を重ねて開く

export interface CreditTarget {
  credit: Credit
  // 制作会社のとき、結びつけた Shikimori の制作会社（結びつけられなければ null）
  studio: { id: number; name: string } | null
}

// 一覧の1作品と、その人の役割（「フリーレン役」「出演」「主題歌」「監督」など）
interface CreditWork {
  media: Media
  roles: string[]
}

type Found = { kind: 'loading' } | { kind: 'found'; works: CreditWork[] } | { kind: 'missing' } | { kind: 'error'; message: string }

type Order = 'newest' | 'popular'

// 一覧に出さない形式（宣伝の映像）
const HIDDEN_FORMATS = new Set(['PV', 'CM'])
// 最初に出す件数（多い人は数百ある）
const FIRST = 60

// 新着順: 放送年の新しい順（年の分からない作品は最後）。人気順: Shikimori でリストに入れている人の多い順
function orderWorks(works: readonly CreditWork[], order: Order): CreditWork[] {
  return [...works].sort((a, b) =>
    order === 'popular'
      ? (b.media.popularity ?? 0) - (a.media.popularity ?? 0) || b.media.idMal - a.media.idMal
      : (b.media.seasonYear ?? -1) - (a.media.seasonYear ?? -1) || b.media.idMal - a.media.idMal,
  )
}

// 成人向けと宣伝の映像は出さない
const shown = (m: Media) => !m.isAdult && !(m.format && HIDDEN_FORMATS.has(m.format))

async function load(target: CreditTarget): Promise<Found> {
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
    const names = [...new Set(c.characters.flatMap((ch) => japanese.get(ch.id) ?? ch.name ?? []))]
    roles.set(c.id, [names.length > 0 ? `${names.join('、')}役` : '出演'])
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
  const [order, setOrder] = useState<Order>('newest')
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
  const name = target.credit.name

  return (
    <>
      <Sheet label={name} size="page" active={props.active && open === null} onClose={props.onClose}>
        <h2 className="detail__title">{name}</h2>
        <p className="detail__meta">
          {target.credit.kind === 'org' ? '制作した作品' : '参加した作品'}
          {found.kind === 'found' && list.length > 0 && `（${list.length}作品）`}
        </p>

        {found.kind === 'loading' && (
          <Loading label="参加作品を検索中" />
        )}
        {found.kind === 'error' && <p className="settings__error">{found.message}</p>}
        {(found.kind === 'missing' || (found.kind === 'found' && list.length === 0)) && (
          <div className="detail__section">
            <p className="detail__meta">参加作品を見つけられませんでした。</p>
            <a className="detail__source" href={annictCreditUrl(target.credit)} target="_blank" rel="noreferrer">
              Annict で見る
            </a>
          </div>
        )}

        {list.length > 1 && (
          <>
            <div className="toggle toggle--full creditworks__order" role="group" aria-label="並べ替え">
              <button type="button" aria-pressed={order === 'newest'} onClick={() => setOrder('newest')}>
                新着順
              </button>
              <button type="button" aria-pressed={order === 'popular'} onClick={() => setOrder('popular')}>
                人気順
              </button>
            </div>
            <p className="note">{order === 'newest' ? '放送の新しい順です。' : 'Shikimori でリストに入れている人の多い順です。'}</p>
          </>
        )}

        {visible.length > 0 && (
          <ul className="creditworks">
            {visible.map(({ media: m, roles }) => {
              const state = mine.get(m.idMal)
              const meta = [m.seasonYear ? `${m.seasonYear}年` : null, m.format ? (FORMAT_LABEL[m.format] ?? null) : null].filter(Boolean).join(' · ')
              return (
                <li key={m.idMal}>
                  <button type="button" className="creditworks__item" onClick={() => setOpen(m)}>
                    <span className="creditworks__cover">{m.cover && <CoverImage cover={m.cover} size="thumb" lazy />}</span>
                    <span className="creditworks__text">
                      <span className="creditworks__title">{m.title.native ?? m.title.romaji ?? m.title.english ?? `MAL ${m.idMal}`}</span>
                      {meta && <span className="creditworks__meta">{meta}</span>}
                      {roles.length > 0 && <span className="creditworks__roles">{roles.join('・')}</span>}
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
            ほかの{list.length - FIRST}作品も見る
          </button>
        )}
        {found.kind === 'found' && list.length > 0 && <p className="detail__source">作品の一覧は Shikimori の情報です。</p>}
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
