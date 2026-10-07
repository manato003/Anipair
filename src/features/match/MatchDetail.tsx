import { useEffect, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictMissingLinks, type WorkRef } from '../../lib/annict'
import { messageOf } from '../../lib/useWriteQueue'
import { WorkDetail, type Enqueue, type RelatedChange } from '../browse/WorkDetail'
import { titleOf, type MatchCard } from './useMatching'
import { Loading } from '../../components/Loading'

type Found = { kind: 'loading' } | { kind: 'found'; ref: WorkRef } | { kind: 'missing' } | { kind: 'error'; message: string }

// マッチングの候補の詳細（読むだけ）。候補は Shikimori の作品なので、詳細を出すには先に Annict の作品を特定する。
// 探しているあいだと見つからなかったときは、Shikimori の題名とポスターだけの簡素なシートを出す。
// 候補ごとに作り直す（呼ぶ側で key を候補にする）
export function MatchDetail(props: {
  token: string
  card: MatchCard
  resolve: (card: MatchCard) => Promise<WorkRef | null>
  active: boolean
  // 関連作品のシートの送信先と、記録したことの知らせ（WorkDetail に渡す）
  relatedEnqueue: Enqueue
  onRelatedChange: RelatedChange
  onClose: () => void
}) {
  const { card, resolve } = props
  const [found, setFound] = useState<Found>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    resolve(card)
      .then((ref) => !cancelled && setFound(ref ? { kind: 'found', ref } : { kind: 'missing' }))
      .catch((e) => !cancelled && setFound({ kind: 'error', message: messageOf(e) }))
    return () => {
      cancelled = true
    }
  }, [card, resolve])

  if (found.kind === 'found') {
    return (
      <WorkDetail
        readOnly
        token={props.token}
        work={found.ref}
        cover={card.media.cover}
        active={props.active}
        relatedEnqueue={props.relatedEnqueue}
        onRelatedChange={props.onRelatedChange}
        onClose={props.onClose}
      />
    )
  }

  const title = titleOf(card.media)
  return (
    <Sheet label={title} active={props.active} onClose={props.onClose}>
      <header className="detail__head">
        <div className="detail__cover">{card.media.cover && <CoverImage cover={card.media.cover} size="large" />}</div>
        <div className="detail__titles">
          <h2 className="detail__title">{title}</h2>
          {found.kind === 'loading' && <Loading className="detail__meta" label="Annict で作品を検索中" />}
          {found.kind === 'missing' && (
            <>
              <p className="detail__meta">Annict で作品を見つけられませんでした。</p>
              {annictMissingLinks(title).map((l) => (
                <a key={l.href} className="detail__source" href={l.href} target="_blank" rel="noreferrer">
                  {l.text}
                </a>
              ))}
            </>
          )}
          {found.kind === 'error' && <p className="settings__error">{found.message}</p>}
        </div>
      </header>
    </Sheet>
  )
}
