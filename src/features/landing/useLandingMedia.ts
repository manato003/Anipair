import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMedia, fetchSimilar, type Media } from '../../lib/shikimori'
import { DEMO_IDS } from './demoWorks'
import { usableMedia } from './demo'

// 似た作品のうち、提案の候補として作品の情報まで受け取る数（1回の問い合わせに収まる数）
const SIMILAR_TAKE = 12

export type LoadState = 'loading' | 'ready' | 'failed'

// 紹介ページのデモの作品情報。棚とカードの作品は開いたときに1回でまとめて、提案の似た作品は要るときに1作品ずつ受け取る。
// 受け取ったものは画面の中だけに持つ（似た作品の控えは、ログイン後のマッチングと同じく端末に残る。答えは残さない）
export function useLandingMedia() {
  const [media, setMedia] = useState<ReadonlyMap<number, Media>>(new Map())
  const [state, setState] = useState<LoadState>('loading')
  const [similar, setSimilar] = useState<ReadonlyMap<number, readonly number[]>>(new Map())
  const [similarFailed, setSimilarFailed] = useState<number | null>(null)
  const asking = useRef(new Set<number>())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    fetchMedia(DEMO_IDS)
      .then((got) => {
        if (!alive) return
        setMedia((cur) => new Map([...cur, ...got]))
        setState('ready')
      })
      .catch(() => alive && setState('failed'))
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState('loading')
    setAttempt((n) => n + 1)
  }, [])

  // basis の似た作品を受け取る（同じ作品を重ねて頼まない）。表紙と題名のある作品だけを候補に残す
  const askSimilar = useCallback((basis: number) => {
    if (asking.current.has(basis)) return
    asking.current.add(basis)
    setSimilarFailed(null)
    fetchSimilar(basis)
      .then(async (ids) => {
        const take = ids.slice(0, SIMILAR_TAKE)
        const got = await fetchMedia(take)
        setMedia((cur) => new Map([...cur, ...got]))
        setSimilar((cur) => new Map(cur).set(basis, take.filter((id) => usableMedia(got.get(id)))))
      })
      .catch(() => setSimilarFailed(basis))
      .finally(() => asking.current.delete(basis))
  }, [])

  return { media, state, retry, similar, similarFailed, askSimilar }
}
