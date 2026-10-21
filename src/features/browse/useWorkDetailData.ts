import { useEffect, useRef, useState } from 'react'
import { fetchWorkDetail, type MyReview, type WorkDetail as Detail } from '../../lib/annict'
import { getLang } from '../../lib/i18n'
import { malIdOf } from '../../lib/malId'
import { getMyReviews } from '../../lib/myReviews'
import { fetchCastNames, fetchMedia, type Media } from '../../lib/shikimori'
import { messageOf } from '../../lib/useWriteQueue'
import { fetchWikiSynopsis, type WikiSynopsis } from '../../lib/wikipedia'

// 作品の詳細のシートが読むもの（Annict の詳細・Shikimori の作品データ・自分の感想・Wikipedia のあらすじ・英語の画面のキャラクター名）。
// 記録の編集（状態・評価）は WorkDetail.tsx に残し、届いた詳細と感想は on で渡す（届いた時点で、その場の編集の有無を見て反映するため）

// シートが下から出てくる動きの長さ。読み込みはこのあとに始める
const OPEN_ANIMATION_MS = 240
// 待つのをやめて、届いた分から中身を出すまでの時間
const CONTENT_WAIT_MS = 2500

export interface WorkDetailData {
  detail: Detail | null
  error: string | null
  shiki: Media | null
  // Shikimori の作品データを読み終えた（取れなかったときも）。MyAnimeList の ID が無い作品は初めから終えている
  shikiDone: boolean
  // あらすじ（Wikipedia の「あらすじ」の節の冒頭の段落）。読み込み中は undefined、無い・読めないときは null
  wiki: WikiSynopsis | null | undefined
  // 英語の画面のキャラクターのローマ字の名前（Shikimori）。日本語の画面では null のまま
  castRomaji: ReadonlyMap<string, string> | null
  // 待つのをやめて中身を出した
  waitedLong: boolean
}

export function useWorkDetailData(
  token: string,
  work: { id: string; annictId: number; malAnimeId: string | null },
  readOnly: boolean,
  on: { detail?: (d: Detail) => void; myReview?: (review: MyReview | undefined) => void },
): WorkDetailData {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shiki, setShiki] = useState<Media | null>(null)
  const [shikiDone, setShikiDone] = useState(() => !malIdOf(work))
  const [wiki, setWiki] = useState<WikiSynopsis | null | undefined>(undefined)
  const [castRomaji, setCastRomaji] = useState<ReadonlyMap<string, string> | null>(null)
  const [waitedLong, setWaitedLong] = useState(false)
  // 届いたときに呼ぶ処理は、いつも最新のものを使う（読み込みをやり直さないように、依存には入れない）
  const onRef = useRef(on)
  useEffect(() => {
    onRef.current = on
  })

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchWorkDetail(token, work.id)
        .then((d) => {
          if (cancelled) return
          setDetail(d)
          onRef.current.detail?.(d)
        })
        .catch((e) => !cancelled && setError(messageOf(e)))
      const mal = malIdOf(work)
      if (mal) {
        fetchMedia([mal])
          .then((m) => !cancelled && setShiki(m.get(mal) ?? null))
          .catch(() => undefined)
          .finally(() => !cancelled && setShikiDone(true))
      }
      // 読むだけのシートは、自分の評価を読まない（アクティビティを全部辿るので重い）
      if (!readOnly) {
        getMyReviews(token)
          .then((map) => !cancelled && onRef.current.myReview?.(map.get(work.annictId)))
          .catch(() => undefined)
      }
    }
    // 読み込みと、届いた中身の処理（作品ページの HTML の読み取りなど）は重い。シートが下から出てくる動きが終わってから始め、
    // 動きの途中でカクつかないようにする（2026-10-03 にスマホ相当の速さで実測）
    const timer = window.setTimeout(load, OPEN_ANIMATION_MS)
    const giveUp = window.setTimeout(() => setWaitedLong(true), OPEN_ANIMATION_MS + CONTENT_WAIT_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(giveUp)
    }
  }, [token, work, readOnly])

  // 英語の画面: キャラクターのローマ字の名前（Shikimori）
  useEffect(() => {
    const mal = malIdOf(work)
    if (getLang() !== 'en' || !mal) return
    let cancelled = false
    void fetchCastNames(mal).then((m) => !cancelled && setCastRomaji(m))
    return () => {
      cancelled = true
    }
  }, [work])

  // 詳細（Annict）が届いたら、その Wikipedia の記事からあらすじを読む（記事ごとに1回。lib/wikipedia.ts）
  useEffect(() => {
    if (!detail) return
    let cancelled = false
    fetchWikiSynopsis(detail.wikipediaUrl).then(
      (w) => !cancelled && setWiki(w),
      () => !cancelled && setWiki(null),
    )
    return () => {
      cancelled = true
    }
  }, [detail])

  return { detail, error, shiki, shikiDone, wiki, castRomaji, waitedLong }
}
