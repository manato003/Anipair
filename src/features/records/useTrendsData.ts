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
  const [error, setError] = useState<string | null>(null)
  const watchedRows = useMemo(() => (rows ?? []).filter((r) => r.entry.state === 'WATCHED'), [rows])
  useEffect(() => {
    if (!enabled || !rows) return
    let cancelled = false
    const malIds = rows.map((r) => Number(r.entry.malAnimeId)).filter((n) => Number.isInteger(n) && n > 0)
    fetchMedia(malIds, { background: true }).then(
      (m) => !cancelled && setMedia(m),
      (e) => !cancelled && setError(messageOf(e)),
    )
    fetchCredits(
      token,
      watchedRows.map((r) => r.entry.workId),
      { background: true },
    ).then(
      (c) => !cancelled && setCredits(c),
      (e) => !cancelled && setError(messageOf(e)),
    )
    return () => {
      cancelled = true
    }
  }, [token, rows, watchedRows, enabled])
  return { media, credits, error }
}
