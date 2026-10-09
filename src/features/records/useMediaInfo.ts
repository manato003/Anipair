import { useEffect, useMemo, useState } from 'react'
import { fetchMedia } from '../../lib/shikimori'
import type { MediaInfo } from './recordList'

// 作品のジャンル・テーマと制作会社（Shikimori）。記録とブラウズの絞り込みで使う。絞り込みのシートを開いたとき、またはその条件をかけているときだけ読む。
// 読み終わるまでは null。読めた分だけ使う（読めなかった作品は、ジャンル・制作会社の条件に当てはまらない扱い）
export function useMediaInfo(works: readonly { malAnimeId: string | null }[] | null, enabled: boolean): { info: ReadonlyMap<number, MediaInfo> | null; error: string | null } {
  // 作品の ID の並び（行の参照が変わっても、作品が同じなら読み直さない）
  const key = useMemo(
    () =>
      [...new Set((works ?? []).map((w) => Number(w.malAnimeId)).filter((n) => Number.isInteger(n) && n > 0))]
        .sort((a, b) => a - b)
        .join(','),
    [works],
  )
  const [state, setState] = useState<{ key: string; info: ReadonlyMap<number, MediaInfo> | null; error: string | null }>({ key: '', info: null, error: null })

  useEffect(() => {
    if (!enabled || !key || state.key === key) return
    let cancelled = false
    const ids = key.split(',').map(Number)
    fetchMedia(ids, { background: true }).then(
      (media) => {
        if (cancelled) return
        const info = new Map<number, MediaInfo>()
        for (const [id, m] of media) info.set(id, { genres: [...m.genres, ...m.themes], studios: m.studios, minutes: m.duration ?? null, episodes: m.episodes || null, airing: m.status === 'RELEASING' })
        setState({ key, info, error: null })
      },
      (e: unknown) => !cancelled && setState({ key, info: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [enabled, key, state.key])

  return state.key === key ? { info: state.info, error: state.error } : { info: null, error: null }
}
