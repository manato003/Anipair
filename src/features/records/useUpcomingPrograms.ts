import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchUpcomingPrograms } from '../../lib/annict'
import type { Slot } from '../../lib/broadcast'
import { previousSeason, seasonOf } from '../../lib/season'
import { loadPrograms, savePrograms, type StoredPrograms } from '../../lib/storage'

// 見てる作品の、これから先の放送予定（Issue #32）。放送中の作品（今期・前期のもの、または Shikimori で放送中のもの）だけを読む。
// 端末に控え、半日たった作品だけ読み直す（Annict の再取得の目安は、放送中の作品で数日〜1週間）。読めなくても、記録の画面は止めない。
// 記録の「見てる」と作品の詳細の両方から使うので、控えは作品ごとに足していき、7日読んでいない作品の分だけ捨てる。
// 読み切れなかった作品（partial）は、控えても古いものとして扱い、次に開いたときに読み直す（#34）
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

function isStale(e: StoredPrograms | undefined, now: number): boolean {
  return !e || e.partial === true || !(now - Date.parse(e.at) <= STALE_MS)
}

// slots: 作品の ID → 放送予定（読んだ作品だけ）。partial: 読み切れなかった作品の ID。
// failed: 最後に読もうとして読めなかった。retry: もう一度読む
export function useUpcomingPrograms(
  token: string,
  workIds: readonly string[],
  enabled: boolean,
): { slots: ReadonlyMap<string, readonly Slot[]>; partial: ReadonlySet<string>; failed: boolean; retry: () => void } {
  const key = useMemo(() => [...new Set(workIds)].sort().join(','), [workIds])
  const [stored, setStored] = useState<ReadonlyMap<string, StoredPrograms>>(loadPrograms)
  const [failed, setFailed] = useState(false)
  // 1回の画面で同じ作品を読みに行くのは1回まで（読み切れなかった・読めなかった作品を続けて問い合わせない）。もう一度で増やす
  const [attempt, setAttempt] = useState(0)
  const tried = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !key) return
    const ids = key.split(',')
    const stale = ids.filter((id) => isStale(stored.get(id), Date.now()))
    const marker = `${key}#${attempt}`
    if (stale.length === 0 || tried.current === marker) return
    let cancelled = false
    let settled = false
    tried.current = marker
    fetchUpcomingPrograms(token, stale).then(
      (got) => {
        settled = true
        if (cancelled) return
        const at = new Date().toISOString()
        // ほかの画面が足した分も残す（いまの端末の控えに足す）。7日読んでいない作品の分は捨てる
        const next = new Map([...loadPrograms()].filter(([, e]) => Date.now() - Date.parse(e.at) < DROP_MS))
        // 頼んだのに返らなかった作品（消えた作品など）も、読んだことにする（読み直しを繰り返さない）
        for (const id of stale) {
          const r = got.get(id)
          next.set(id, r && !r.complete ? { at, slots: r.slots, partial: true } : { at, slots: r?.slots ?? [] })
        }
        savePrograms(next)
        setFailed(false)
        setStored(next)
      },
      () => {
        settled = true
        // 読めなかったら、控えのまま（もう一度を押すか、次に開いたときに読み直す）
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
      // 読み終える前に止めたなら、次に頼まれたときにまた読む
      if (!settled) tried.current = null
    }
  }, [enabled, key, token, stored, attempt])

  const retry = useCallback(() => {
    setFailed(false)
    setAttempt((n) => n + 1)
  }, [])
  const slots = useMemo(() => new Map([...stored].map(([id, e]) => [id, e.slots])), [stored])
  const partial = useMemo(() => new Set([...stored].filter(([, e]) => e.partial).map(([id]) => id)), [stored])
  return { slots, partial, failed, retry }
}
