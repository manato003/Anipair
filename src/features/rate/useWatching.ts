import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers } from '../../lib/covers'
import { fetchLibrary, updateStatus, type RatingState, type StatusState } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { changeRating } from '../../lib/reviewOps'
import { messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import { pickWatching, toWatchCards, type WatchAnswer, type WatchCard } from './watching'

interface UndoEntry {
  card: WatchCard
  answer: WatchAnswer
  index: number
  // 評価を付けたときの、付ける前の総合評価（null は評価なし）。送信で読んだときに埋まる。
  // 取り消しの送信は同じ列の後ろに並ぶので、実行時には（送信が成功していれば）埋まっている
  before: RatingState | null | undefined
}

const TARGET: Record<Exclude<WatchAnswer['kind'], 'still'>, StatusState> = {
  rate: 'WATCHED',
  watched: 'WATCHED',
  stop: 'STOP_WATCHING',
}

// 評価の画面の山の先頭: いま「見てる」の作品を1枚ずつ出して、見終わったものを評価する
export function useWatching(token: string) {
  const [cards, setCards] = useState<WatchCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const { pending, failed, enqueue, retryFailed, dismissFailed } = useWriteQueue()
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)
  // 読み直しの判断用（読み込みが済んだか・いまの位置・送信待ちの件数）
  const loaded = useRef(false)
  const indexRef = useRef(0)
  const pendingRef = useRef(0)
  useEffect(() => {
    indexRef.current = index
    pendingRef.current = pending
  })

  const load = useCallback(async (): Promise<WatchCard[]> => {
    const entries = pickWatching(await fetchLibrary(token))
    const covers = await fetchCovers(entries)
    return toWatchCards(entries, covers)
  }, [token])

  useEffect(() => {
    let cancelled = false
    load().then(
      (list) => {
        if (cancelled) return
        setCards(list)
        loaded.current = true
      },
      (e) => !cancelled && setLoadError(messageOf(e)),
    )
    return () => {
      cancelled = true
    }
  }, [load, reloadTick])

  const reload = useCallback(() => {
    loaded.current = false
    setLoadError(null)
    setCards(null)
    setIndex(0)
    undoStack.current = []
    setUndoCount(0)
    setReloadTick((t) => t + 1)
  }, [])

  // 別の画面で見てる作品が増減していても追いつくように、まだ手を付けていないデッキだけ裏で読み直す。
  // 答え始めていたり、送信待ちがあったりしたら何もしない（位置と取り消しを崩さない）
  const refreshIfIdle = useCallback(() => {
    const idle = () => loaded.current && indexRef.current === 0 && undoStack.current.length === 0 && pendingRef.current === 0
    if (!idle()) return
    load()
      .then((list) => {
        if (idle()) setCards(list)
      })
      .catch(() => undefined)
  }, [load])

  const answer = useCallback(
    (a: WatchAnswer) => {
      if (!cards || index >= cards.length) return
      const card = cards[index]
      const entry: UndoEntry = { card, answer: a, index, before: undefined }
      undoStack.current.push(entry)
      setUndoCount(undoStack.current.length)
      setIndex(index + 1)
      // まだ見てる: 何も送らず次へ
      if (a.kind === 'still') return
      const { workId, annictId, title } = card.entry
      enqueue(`「${title}」の記録`, async () => {
        await updateStatus(token, workId, TARGET[a.kind])
        if (a.kind !== 'rate') return
        // すでに感想があるかもしれない（見ている途中で評価した作品）。送信の時点の実際の感想を、共有の控えから読む
        const current = (await getMyReviews(token)).get(annictId) ?? null
        entry.before = current?.ratingOverallState ?? null
        await rememberReview(token, annictId, await changeRating(token, workId, current, a.rating))
      })
    },
    [cards, index, token, enqueue],
  )

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    setIndex(entry.index)
    if (entry.answer.kind === 'still') return
    const { workId, annictId, title } = entry.card.entry
    enqueue(`「${title}」の取り消し`, async () => {
      await updateStatus(token, workId, 'WATCHING')
      // 評価を付けていたら、付ける前の評価に戻す（無かったなら消す）
      if (entry.answer.kind === 'rate' && entry.before !== undefined) {
        const current = (await getMyReviews(token)).get(annictId) ?? null
        await rememberReview(token, annictId, await changeRating(token, workId, current, entry.before))
      }
    })
  }, [token, enqueue])

  const current = cards && index < cards.length ? cards[index] : null
  const next = cards && index + 1 < cards.length ? cards[index + 1] : null

  return {
    cards,
    index,
    current,
    next,
    done: cards !== null && cards.length > 0 && index >= cards.length,
    loadError,
    pending,
    failed,
    canUndo: undoCount > 0,
    answer,
    undo,
    reload,
    refreshIfIdle,
    retryFailed,
    dismissFailed,
  }
}
