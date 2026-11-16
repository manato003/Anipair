import { useEffect, useMemo, useState } from 'react'
import { fetchCredits, type WorkCredits } from '../../lib/annict'
import { fetchMedia, type Media } from '../../lib/shikimori'
import { messageOf } from '../../lib/useWriteQueue'
import type { RecordRow } from './recordList'

// 傾向とふり返りに使う作品の情報（ジャンル・制作会社・世間の点数は Shikimori、声優と監督は Annict）。裏の優先度で読み、読めた分から使う
export type TrendsData = ReturnType<typeof useTrendsData>

// enabled: まとめを初めて開いたときから読む（記録の一覧を早く出す）
export function useTrendsData(token: string, rows: readonly RecordRow[] | null, enabled: boolean) {
  const [media, setMedia] = useState<ReadonlyMap<number, Media> | null>(null)
  const [credits, setCredits] = useState<ReadonlyMap<string, WorkCredits> | null>(null)
  // 失敗は取得元ごとに持つ（片方が読めれば、その分の失敗の文は消える。もう片方の失敗は残る）
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [creditsError, setCreditsError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const watchedRows = useMemo(() => (rows ?? []).filter((r) => r.entry.state === 'WATCHED'), [rows])
  useEffect(() => {
    if (!enabled || !rows) return
    let cancelled = false
    const malIds = rows.map((r) => Number(r.entry.malAnimeId)).filter((n) => Number.isInteger(n) && n > 0)
    // 失敗したら、まだ何も読めていないときだけ空で終わらせる（読み込み中の印を出したままにせず、読めた分で出す。
    // 一度読めていたデータは残す。「もう一度」か記録の変更で読み直す）
    fetchMedia(malIds, { background: true }).then(
      (m) => {
        if (cancelled) return
        setMedia(m)
        setMediaError(null)
      },
      (e) => {
        if (cancelled) return
        setMedia((prev) => prev ?? new Map())
        setMediaError(messageOf(e))
      },
    )
    fetchCredits(
      token,
      watchedRows.map((r) => r.entry.workId),
      { background: true },
    ).then(
      (c) => {
        if (cancelled) return
        setCredits(c)
        setCreditsError(null)
      },
      (e) => {
        if (cancelled) return
        setCredits((prev) => prev ?? new Map())
        setCreditsError(messageOf(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [token, rows, watchedRows, enabled, attempt])
  // 「もう一度」: 失敗して空で置いた方は読み込み中に戻す（押しても画面が変わらず、また同じ文のままになるのを防ぐ）
  const retry = () => {
    if (mediaError && media?.size === 0) setMedia(null)
    if (creditsError && credits?.size === 0) setCredits(null)
    setAttempt((n) => n + 1)
  }
  // mediaFailed: 世間の点数・ジャンルが読めていない（空は「読めた」ではなく「読めなかった」）
  return { media, credits, error: mediaError ?? creditsError, mediaFailed: mediaError !== null, creditsFailed: creditsError !== null, retry }
}
