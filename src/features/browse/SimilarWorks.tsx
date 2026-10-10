import { useEffect, useMemo, useRef, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { peekLibrary } from '../../lib/annict'
import { fetchMedia, fetchSimilar, type Media } from '../../lib/shikimori'
import { FORMAT_LABEL, marksByMal } from './detail'
import type { RelatedTarget } from './RelatedDetail'

// 作品の詳細の「似た作品」。Shikimori の似た作品（似ている順）を、表紙の棚として横に並べる。
// 押すと、関連作品と同じく、アプリの中でその作品の詳細を重ねて開く。
// 詳細は評価やマッチングから何度も開くので、棚が画面に近づくまでは問い合わせない（似た作品は端末に30日控える）

// 棚に出す件数
const LIMIT = 12
// 宣伝の映像は出さない
const NOISE_FORMATS = new Set(['PV', 'CM', 'MUSIC'])

type Shelf = { kind: 'idle' } | { kind: 'done'; works: Media[] } | { kind: 'error' }

export function SimilarWorks(props: { malId: number | null; onOpen: (target: RelatedTarget) => void }) {
  const { malId } = props
  const ref = useRef<HTMLDivElement>(null)
  // IntersectionObserver の無い環境は、すぐ読む
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const [shelf, setShelf] = useState<{ malId: number; shelf: Shelf } | null>(null)
  const mine = useMemo(() => marksByMal(peekLibrary()), [])

  // 棚の位置が画面の下 300px 以内に来たら読み込む
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '0px 0px 300px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (!near || !malId) return
    let cancelled = false
    fetchSimilar(malId)
      .then((ids) => fetchMedia(ids.slice(0, LIMIT * 2)).then((map) => ids.flatMap((id) => map.get(id) ?? [])))
      .then(
        (list) => {
          if (cancelled) return
          const works = list.filter((m) => m.idMal !== malId && !NOISE_FORMATS.has(m.format ?? '')).slice(0, LIMIT)
          setShelf({ malId, shelf: { kind: 'done', works } })
        },
        () => !cancelled && setShelf({ malId, shelf: { kind: 'error' } }),
      )
    return () => {
      cancelled = true
    }
  }, [near, malId])

  if (!malId) return null
  const current = shelf?.malId === malId ? shelf.shelf : { kind: 'idle' as const }
  // 読み込むまでは、位置を測るための空の箱だけ置く。似た作品が無い・読めないときは何も出さない
  if (current.kind !== 'done' || current.works.length === 0) return <div ref={ref} className="similar__probe" aria-hidden />
  return (
    <section className="detail__section similar">
      <h3 className="detail__label">似た作品</h3>
      <ul className="similar__list">
        {current.works.map((m) => {
          const title = m.title.native ?? m.title.romaji ?? m.title.english ?? `MAL ${m.idMal}`
          const meta = [m.seasonYear ? `${m.seasonYear}年` : null, m.format ? (FORMAT_LABEL[m.format] ?? null) : null].filter(Boolean).join(' ')
          const state = mine.get(m.idMal)
          return (
            <li key={m.idMal}>
              <button type="button" className="similar__item" onClick={() => props.onOpen({ kind: 'shiki', media: m })}>
                <span className="similar__cover">
                  {m.cover && <CoverImage cover={m.cover} size="thumb" lazy />}
                  {state && <span className="similar__mine">{state}</span>}
                </span>
                <span className="similar__title">{title}</span>
                {meta && <span className="similar__meta">{meta}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="detail__source">似た作品は Shikimori の情報です。</p>
    </section>
  )
}
