import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createReview, deleteReview, fetchSeasonWorks, updateStatus } from '../../lib/annict'
import { fetchCovers } from '../../lib/anilist'
import type { GithubConnection } from '../../lib/github'
import { rememberReview } from '../../lib/myReviews'
import { blankReview } from '../../lib/reviewOps'
import { nextSeason, previousSeason, seasonOf, toSlug, type Season } from '../../lib/season'
import { loadBackfillSeason, saveBackfillSeason } from '../../lib/storage'
import { useCoalescedTask } from '../../lib/useCoalescedTask'
import { messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import { activeUnseenIds } from './unseen'
import { loadLocalUnseen, setUnseen, syncUnseen } from './unseenStore'
import { OLDEST_YEAR, malIdsOf, pickQueue, toCards, type Answer, type Card } from './queue'

interface UndoEntry {
  card: Card
  answer: Answer
  index: number
  // 送信が終わってから埋まる。取り消しの送信は同じ列の後ろに並ぶので、実行時には必ず埋まっている
  reviewId: string | null
}

export function useBackfill(token: string, github: GithubConnection | null = null) {
  const [season, setSeason] = useState<Season>(() => loadBackfillSeason() ?? seasonOf(new Date()))
  const [cards, setCards] = useState<Card[] | null>(null)
  const [index, setIndex] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const { pending, failed, enqueue, retryFailed, dismissFailed } = useWriteQueue()
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // 「見てない」を GitHub と合わせたつなぎ（デッキを読むたびには合わせない。押したときの同期は別。つなぎ先が変われば合わせ直す）
  const synced = useRef<GithubConnection | null>(null)
  // 記録済みで空のクールを、前のクールへ自動で飛ばすか。次のクールへ進んだときは飛ばさず、空だと見せる（戻されないように）
  const skipEmpty = useRef(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // 「見てない」を他の端末と合わせる。失敗しても、この端末の記録で進める
        let unseen = loadLocalUnseen()
        const worksPromise = fetchSeasonWorks(token, toSlug(season))
        // 同期を待つあいだに失敗しても、未処理の拒否として扱われないように（失敗はあとの await で受ける）
        worksPromise.catch(() => undefined)
        if (github && synced.current !== github) {
          try {
            unseen = await syncUnseen(github)
            synced.current = github
            if (!cancelled) setSyncNote(null)
          } catch (e) {
            if (!cancelled) setSyncNote(`GitHub と同期できませんでした（${messageOf(e)}）。この端末の記録だけで進めます。`)
          }
        }
        const works = pickQueue(await worksPromise, activeUnseenIds(unseen))
        if (cancelled) return
        if (works.length === 0) {
          // 人気作をすべて記録済みのクールは飛ばす
          const prev = previousSeason(season)
          if (!skipEmpty.current) {
            setCards([])
          } else if (prev.year < OLDEST_YEAR) {
            setFinished(true)
          } else {
            saveBackfillSeason(prev)
            setSeason(prev)
          }
          return
        }
        const covers = await fetchCovers(malIdsOf(works))
        if (cancelled) return
        setCards(toCards(works, covers))
      } catch (e) {
        if (!cancelled) setLoadError(messageOf(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, github, season, reloadTick])

  // 始まる前の同期はまとめる（詳しくは useCoalescedTask）
  const syncRun = useMemo(() => (github ? async () => void (await syncUnseen(github)) : null), [github])
  const syncLater = useCoalescedTask(enqueue, '「見てない」の記録の GitHub への保存', syncRun)

  const goToSeason = useCallback((next: Season, forward = false) => {
    if (next.year < OLDEST_YEAR) {
      setFinished(true)
      return
    }
    skipEmpty.current = !forward
    setFinished(false)
    saveBackfillSeason(next)
    setCards(null)
    setIndex(0)
    setLoadError(null)
    undoStack.current = []
    setUndoCount(0)
    setSeason(next)
  }, [])

  const reload = useCallback(() => {
    setLoadError(null)
    setCards(null)
    setReloadTick((t) => t + 1)
  }, [])

  const answer = useCallback(
    (a: Answer) => {
      if (!cards || index >= cards.length) return
      const card = cards[index]
      const entry: UndoEntry = { card, answer: a, index, reviewId: null }
      undoStack.current.push(entry)
      setUndoCount(undoStack.current.length)
      setIndex(index + 1)
      if (a.kind === 'skip') {
        setUnseen(card.work.annictId, true)
        syncLater()
        return
      }
      const state = a.kind === 'wanna' ? 'WANNA_WATCH' : a.kind === 'watching' ? 'WATCHING' : 'WATCHED'
      enqueue(`「${card.work.title}」の記録`, async () => {
        await updateStatus(token, card.work.id, state)
        if (a.kind === 'rate') {
          entry.reviewId = await createReview(token, card.work.id, a.rating)
          // 共有の感想の控えにも入れる（あとで詳細のシートから評価を変えたときに、作った感想を見つけられるように）
          await rememberReview(token, card.work.annictId, { ...blankReview(), id: entry.reviewId, ratingOverallState: a.rating })
        }
      })
    },
    [cards, index, token, enqueue, syncLater],
  )

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    setIndex(entry.index)
    if (entry.answer.kind === 'skip') {
      setUnseen(entry.card.work.annictId, false)
      syncLater()
      return
    }
    // 列に並んでいる作品は、もともと何も記録していなかったものだけなので「未設定」に戻せばよい
    enqueue(`「${entry.card.work.title}」の取り消し`, async () => {
      if (entry.reviewId) {
        await deleteReview(token, entry.reviewId)
        await rememberReview(token, entry.card.work.annictId, null)
      }
      entry.reviewId = null
      await updateStatus(token, entry.card.work.id, 'NO_STATE')
    })
  }, [token, enqueue, syncLater])

  const current = cards && index < cards.length ? cards[index] : null
  const next = cards && index + 1 < cards.length ? cards[index + 1] : null

  return {
    season,
    cards,
    index,
    current,
    next,
    seasonDone: cards !== null && index >= cards.length,
    finished,
    loadError,
    syncNote,
    pending,
    failed,
    canUndo: undoCount > 0,
    answer,
    undo,
    reload,
    retryFailed,
    dismissFailed,
    goToPrevious: () => goToSeason(previousSeason(season)),
    goToNext: () => goToSeason(nextSeason(season), true),
    // プルダウンで選んだクールへ。› と同じく、記録済みで空でも、選んだクールをそのまま見せる（前へ自動で飛ばさない）
    jumpTo: (target: Season) => goToSeason(target, true),
  }
}
