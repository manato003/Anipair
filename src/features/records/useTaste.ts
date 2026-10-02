import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMediaByMal } from '../../lib/anilist'
import { messageOf } from '../../lib/useWriteQueue'
import { collectPool } from '../match/taste'
import { forgetTaste, loadTaste, type Taste } from '../match/tasteLoader'
import { scoreWanna, type WannaScore } from './wannaRank'

export type TasteState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; taste: Taste } | { status: 'error'; message: string }

// 見たいのおすすめ順と好みの傾向が使う好み。enabled のあいだだけ読み込む（読むのは重いので、使うときまで読まない）。
// 隠れていたタブが再び表示されたときは、古い好みを捨てて読み直す（そのあいだに評価が増えているかもしれない）
export function useTaste(token: string, enabled: boolean, active: boolean): { state: TasteState; retry: () => void } {
  const [res, setRes] = useState<{ taste: Taste } | { error: string } | null>(null)
  const [tick, setTick] = useState(0)
  const hidden = useRef(false)

  useEffect(() => {
    if (!active) {
      hidden.current = true
      return
    }
    if (hidden.current) {
      hidden.current = false
      forgetTaste()
    }
    if (!enabled) return
    let cancelled = false
    loadTaste(token).then(
      (taste) => !cancelled && setRes({ taste }),
      (e) => !cancelled && setRes({ error: messageOf(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [token, enabled, active, tick])

  const retry = useCallback(() => {
    setRes(null)
    setTick((t) => t + 1)
  }, [])

  const state: TasteState = !res
    ? enabled
      ? { status: 'loading' }
      : { status: 'idle' }
    : 'taste' in res
      ? { status: 'ready', taste: res.taste }
      : { status: 'error', message: res.error }
  return { state, retry }
}

// 見たい作品の点数。key は見たい作品の MyAnimeList ID をコンマでつないだもの（一覧の見たいが増減したら計算し直す）。
// 計算し直しているあいだも、前の点数を見せ続ける
export function useWannaScores(taste: Taste | null, key: string): { scores: Map<number, WannaScore> | null; error: string | null; retry: () => void } {
  const [res, setRes] = useState<{ taste: Taste; scores: Map<number, WannaScore> | null; error: string | null } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!taste) return
    let cancelled = false
    const malIds = key ? key.split(',').map(Number) : []
    const wanted = new Set(malIds)
    fetchMediaByMal(malIds).then(
      (details) => {
        // 推薦は、除外なしで集めたもののうち、見たい作品だけを使う
        const pool = collectPool(taste.topSeeds, taste.seedMedia, new Set()).filter((e) => wanted.has(e.malId))
        if (!cancelled) setRes({ taste, scores: scoreWanna(malIds, details, pool, taste.profile), error: null })
      },
      (e) => !cancelled && setRes({ taste, scores: null, error: messageOf(e) }),
    )
    return () => {
      cancelled = true
    }
  }, [taste, key, tick])

  const retry = useCallback(() => {
    setRes(null)
    setTick((t) => t + 1)
  }, [])

  const mine = res && taste && res.taste === taste ? res : null
  return { scores: mine?.scores ?? null, error: mine?.error ?? null, retry }
}
