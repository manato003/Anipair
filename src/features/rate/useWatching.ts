import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { loadStoredLibrary } from '../../lib/offlineCache'
import { fetchLibrary, updateStatus, type RatingState, type StatusState } from '../../lib/annict'
import { getMyReviews, peekMyReview, rememberReview } from '../../lib/myReviews'
import { changeRating } from '../../lib/reviewOps'
import { messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import { askableWatching, markStillWatching, unmarkStillWatching } from './stillWatching'
import { pickWatching, toWatchCards, type WatchAnswer, type WatchCard } from './watching'

interface UndoEntry {
  card: WatchCard
  answer: WatchAnswer
  index: number
  // 評価を付けたときの、付ける前の総合評価（null は評価なし）。送信で読んだときに埋まる。
  // 取り消しの送信は同じ列の後ろに並ぶので、実行時には（送信が成功していれば）埋まっている
  before: RatingState | null | undefined
  // 答えた時点で手元の控えから見た、付ける前の総合評価（閉じて開き直したあとの取り消しの送り直しに使う。lib/writeJournal.ts）
  guess: RatingState | null
}

const TARGET: Record<Exclude<WatchAnswer['kind'], 'still'>, StatusState> = {
  rate: 'WATCHED',
  watched: 'WATCHED',
  stop: 'STOP_WATCHING',
}

// 端末にとっておいた前回のライブラリから作った山。無ければ null
function storedCards(): { cards: WatchCard[]; at: string } | null {
  const lib = loadStoredLibrary()
  if (!lib) return null
  const entries = askableWatching(pickWatching(lib.value))
  return { cards: toWatchCards(entries, quickCovers(entries)), at: lib.at }
}

// 答え始めた山に、読み直した内容を合わせる。答えた分といま出している1枚はそのまま、まだ出していない分は
// 読み直した「見てる」に合わせる（別の端末で見終えた作品を外し、新しく見始めた作品を後ろに足す）
export function mergeWatchDeck(cur: readonly WatchCard[], index: number, fresh: readonly WatchCard[]): WatchCard[] {
  const kept = cur.slice(0, index + 1)
  const keptIds = new Set(kept.map((c) => c.entry.workId))
  return [...kept, ...fresh.filter((c) => !keptIds.has(c.entry.workId))]
}

// 評価の画面の山の先頭: 「見てる」の作品を1枚ずつ出して、見終わったものを評価する（放送中のクールの作品と、このクールに「まだ見てる」と答えた作品は出さない。stillWatching.ts）。
// まず端末にとっておいた前回のライブラリで山を出し（staleAt にその日時）、Annict から読み直したら合わせる（2026-10-06）
export function useWatching(token: string) {
  const [initial] = useState(() => storedCards())
  const [cards, setCards] = useState<WatchCard[] | null>(() => initial?.cards ?? null)
  const [staleAt, setStaleAt] = useState<string | null>(() => initial?.at ?? null)
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
  // 前回の内容で山を出したまま、読み直しに失敗したとき
  const [staleError, setStaleError] = useState<string | null>(null)
  const staleRef = useRef(staleAt !== null)
  useEffect(() => {
    indexRef.current = index
    pendingRef.current = pending
    staleRef.current = staleAt !== null
  })

  const load = useCallback(async (): Promise<WatchCard[]> => {
    const entries = askableWatching(pickWatching(await fetchLibrary(token)))
    const covers = await fetchCovers(entries)
    return toWatchCards(entries, covers)
  }, [token])

  useEffect(() => {
    let cancelled = false
    load().then(
      (list) => {
        if (cancelled) return
        // 前回の内容で山を出していたら、いま出している1枚までは残し、まだ出していない分だけ合わせる（画面の作品を急に入れ替えない。位置と取り消しも崩さない）
        setCards((cur) => (cur ? mergeWatchDeck(cur, indexRef.current, list) : list))
        setStaleAt(null)
        loaded.current = true
      },
      (e) => {
        if (cancelled) return
        // 前回の内容で山を出しているなら、そのまま続けられるので知らせるだけ（山は消さない）
        if (staleRef.current) setStaleError(messageOf(e))
        else setLoadError(messageOf(e))
      },
    )
    return () => {
      cancelled = true
    }
  }, [load, reloadTick])

  const reload = useCallback(() => {
    loaded.current = false
    setLoadError(null)
    setStaleError(null)
    setStaleAt(null)
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
      const entry: UndoEntry = { card, answer: a, index, before: undefined, guess: peekMyReview(token, card.entry.annictId)?.ratingOverallState ?? null }
      undoStack.current.push(entry)
      setUndoCount(undoStack.current.length)
      setIndex(index + 1)
      // まだ見てる: 何も送らず次へ。このクールのあいだは聞き直さない（開き直すたびに同じ作品を出さない。stillWatching.ts）
      if (a.kind === 'still') {
        markStillWatching(card.entry.annictId)
        return
      }
      const { workId, annictId, title } = card.entry
      enqueue(
        `「${title}」の記録`,
        async () => {
          await updateStatus(token, workId, TARGET[a.kind])
          if (a.kind !== 'rate') return
          // すでに感想があるかもしれない（見ている途中で評価した作品）。送信の時点の実際の感想を、共有の控えから読む
          const current = (await getMyReviews(token)).get(annictId) ?? null
          entry.before = current?.ratingOverallState ?? null
          await rememberReview(token, annictId, await changeRating(token, workId, current, a.rating))
        },
        [{ kind: 'status', workId, state: TARGET[a.kind] }, ...(a.kind === 'rate' ? [{ kind: 'rating' as const, workId, annictId, rating: a.rating }] : [])],
      )
    },
    [cards, index, token, enqueue],
  )

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    setIndex(entry.index)
    if (entry.answer.kind === 'still') {
      unmarkStillWatching(entry.card.entry.annictId)
      return
    }
    const { workId, annictId, title } = entry.card.entry
    const rated = entry.answer.kind === 'rate'
    enqueue(
      `「${title}」の取り消し`,
      async () => {
        await updateStatus(token, workId, 'WATCHING')
        // 評価を付けていたら、付ける前の評価に戻す（無かったなら消す）
        if (rated && entry.before !== undefined) {
          const current = (await getMyReviews(token)).get(annictId) ?? null
          await rememberReview(token, annictId, await changeRating(token, workId, current, entry.before))
        }
      },
      [{ kind: 'status', workId, state: 'WATCHING' }, ...(rated ? [{ kind: 'rating' as const, workId, annictId, rating: entry.before ?? entry.guess }] : [])],
    )
  }, [token, enqueue])

  // 関連作品のシートで記録した作品を、これから出てくる山から外す（もう答えてあるので、二度聞かない）。
  // keepCurrent なら、いま出している1枚は残す（画面に出ている作品を急に入れ替えない）
  const dropFromDeck = useCallback(
    (annictId: number, keepCurrent: boolean) => {
      setCards((cur) => {
        if (!cur) return cur
        const from = keepCurrent ? index + 1 : index
        const at = cur.findIndex((c, i) => i >= from && c.entry.annictId === annictId)
        return at < 0 ? cur : cur.filter((_, i) => i !== at)
      })
    },
    [index],
  )

  const current = cards && index < cards.length ? cards[index] : null
  const next = cards && index + 1 < cards.length ? cards[index + 1] : null

  return {
    cards,
    staleAt,
    staleError,
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
    dropFromDeck,
    retryFailed,
    dismissFailed,
  }
}
