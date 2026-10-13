import { useEffect, useMemo, useState } from 'react'
import { fetchUpcomingPrograms } from '../../lib/annict'
import type { Slot } from '../../lib/broadcast'
import { previousSeason, seasonOf } from '../../lib/season'
import { loadPrograms, savePrograms, type StoredPrograms } from '../../lib/storage'

// 見てる作品の、これから先の放送予定（Issue #32）。放送中の作品（今期・前期のもの、または Shikimori で放送中のもの）だけを読む。
// 端末に控え、半日たった作品だけ読み直す（Annict の再取得の目安は、放送中の作品で数日〜1週間）。読めなくても、記録の画面は止めない（出さないだけ）。
// 記録の「見てる」と作品の詳細の両方から使うので、控えは作品ごとに足していき、7日読んでいない作品の分だけ捨てる
const STALE_MS = 12 * 3600 * 1000
const DROP_MS = 7 * 86400 * 1000

export interface ProgramWork {
  seasonYear?: number | null
  seasonName?: string | null
}

export function isAiringCandidate(w: ProgramWork, airing: boolean, now: Date): boolean {
  if (airing) return true
  if (!w.seasonYear || !w.seasonName) return false
  const name = w.seasonName.toLowerCase()
  const cur = seasonOf(now)
  return [cur, previousSeason(cur)].some((s) => s.year === w.seasonYear && s.name === name)
}

// slots: 作品の ID → 放送予定（読んだ作品だけ）。failed: 最後に読もうとして読めなかった
export function useUpcomingPrograms(token: string, workIds: readonly string[], enabled: boolean): { slots: ReadonlyMap<string, readonly Slot[]>; failed: boolean } {
  const key = useMemo(() => [...new Set(workIds)].sort().join(','), [workIds])
  const [stored, setStored] = useState<ReadonlyMap<string, StoredPrograms>>(loadPrograms)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || !key) return
    const ids = key.split(',')
    const now = Date.now()
    const stale = ids.filter((id) => {
      const e = stored.get(id)
      return !e || now - Date.parse(e.at) > STALE_MS
    })
    if (stale.length === 0) return
    let cancelled = false
    fetchUpcomingPrograms(token, stale).then(
      (got) => {
        if (cancelled) return
        const at = new Date().toISOString()
        // ほかの画面が足した分も残す（いまの端末の控えに足す）。7日読んでいない作品の分は捨てる
        const next = new Map([...loadPrograms()].filter(([, e]) => Date.now() - Date.parse(e.at) < DROP_MS))
        // 頼んだのに返らなかった作品（消えた作品など）も、読んだことにする（読み直しを繰り返さない）
        for (const id of stale) next.set(id, { at, slots: got.get(id) ?? [] })
        savePrograms(next)
        setFailed(false)
        setStored(next)
      },
      () => {
        // 読めなかったら、控えのまま（次に開いたときに読み直す）
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, key, token, stored])

  const slots = useMemo(() => new Map([...stored].map(([id, e]) => [id, e.slots])), [stored])
  return { slots, failed }
}
