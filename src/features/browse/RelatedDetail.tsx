import { useEffect, useMemo, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { annictSearchUrl, type SeriesWork, type WorkRef } from '../../lib/annict'
import { fetchCovers } from '../../lib/covers'
import type { Media } from '../../lib/shikimori'
import type { Cover } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { resolveAnnictWork } from '../match/resolve'
import { WorkDetail, type Enqueue, type RelatedChange, type WorkSeed } from './WorkDetail'
import { Loading } from '../../components/Loading'

// 関連作品から開く先。Annict のシリーズの作品か、Shikimori の関連作品（Annict の作品を先に探す）
export type RelatedTarget = { kind: 'annict'; work: SeriesWork } | { kind: 'shiki'; media: Media }

type Found = { kind: 'loading' } | { kind: 'found'; ref: WorkRef } | { kind: 'missing' } | { kind: 'error'; message: string }

// 関連作品の詳細。元の作品の詳細の上に、もう1枚のシートとして重ねて開く（Annict のサイトへは移らない。docs/concept.md の設計の原則）。
// 状態や評価は、元の画面が送り先の列（enqueue）を渡したときに変えられる（評価画面・マッチングから開いても変えられる）。
// 変えたことは onChange で元の画面に知らせ、元の画面が一覧の表示を合わせたり、山や候補から外したりする
export function RelatedDetail(
  props: {
    token: string
    target: RelatedTarget
    active: boolean
    onClose: () => void
  } & ({ readOnly: true } | { readOnly?: false; enqueue: Enqueue; onChange: RelatedChange }),
) {
  const { token, target } = props
  const [found, setFound] = useState<Found>(() =>
    target.kind === 'annict' ? { kind: 'found', ref: { id: target.work.id, annictId: target.work.annictId, title: target.work.title, malAnimeId: target.work.malAnimeId } } : { kind: 'loading' },
  )
  const [cover, setCover] = useState<Cover | null>(() => (target.kind === 'shiki' ? target.media.cover : null))

  // Shikimori の関連作品は、題名で Annict の作品を探す（マッチングの候補と同じやり方）
  useEffect(() => {
    if (target.kind !== 'shiki') return
    let cancelled = false
    resolveAnnictWork(token, target.media).then(
      (ref) => !cancelled && setFound(ref ? { kind: 'found', ref } : { kind: 'missing' }),
      (e) => !cancelled && setFound({ kind: 'error', message: messageOf(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [token, target])

  // Annict のシリーズの作品は、表紙（Shikimori のポスター）を探す
  useEffect(() => {
    if (target.kind !== 'annict') return
    let cancelled = false
    fetchCovers([{ annictId: target.work.annictId, malAnimeId: target.work.malAnimeId }]).then(
      (covers) => !cancelled && setCover(covers.get(target.work.annictId) ?? null),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [target])

  // 詳細に渡す作品は、中身が変わるときだけ作り直す（毎回作ると、表紙が届くなどで描き直すたびに詳細の読み込みがやり直しになる）
  const seed = useMemo<WorkSeed | null>(() => {
    if (found.kind !== 'found') return null
    if (target.kind !== 'annict') return found.ref
    const w = target.work
    return { id: w.id, annictId: w.annictId, title: w.title, malAnimeId: w.malAnimeId, media: w.media, seasonYear: w.seasonYear, seasonName: w.seasonName, viewerStatusState: w.viewerStatusState }
  }, [found, target])

  if (seed) {
    if (props.readOnly) return <WorkDetail readOnly token={token} work={seed} cover={cover} active={props.active} onClose={props.onClose} />
    return (
      <WorkDetail
        token={token}
        work={seed}
        cover={cover}
        active={props.active}
        enqueue={props.enqueue}
        onChange={(patch) => props.onChange({ annictId: seed.annictId, malAnimeId: seed.malAnimeId }, patch)}
        relatedEnqueue={props.enqueue}
        onRelatedChange={props.onChange}
        onClose={props.onClose}
      />
    )
  }

  // 探しているあいだと、見つからなかったとき（Shikimori の関連作品だけ）
  const media = target.kind === 'shiki' ? target.media : null
  const title = media ? (media.title.native ?? media.title.romaji ?? media.title.english ?? `MAL ${media.idMal}`) : ''
  return (
    <Sheet label={title} active={props.active} onClose={props.onClose}>
      <header className="detail__head">
        <div className="detail__cover">{cover && <CoverImage cover={cover} size="large" />}</div>
        <div className="detail__titles">
          <h2 className="detail__title">{title}</h2>
          {found.kind === 'loading' && <Loading className="detail__meta" label="Annict で作品を検索中" />}
          {found.kind === 'missing' && (
            <>
              <p className="detail__meta">Annict で作品を見つけられませんでした。</p>
              <a className="detail__source" href={annictSearchUrl(title)} target="_blank" rel="noreferrer">
                Annict で探す
              </a>
            </>
          )}
          {found.kind === 'error' && <p className="settings__error">{found.message}</p>}
        </div>
      </header>
    </Sheet>
  )
}
