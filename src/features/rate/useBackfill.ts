import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchSeasonWorks, updateStatus, type AnnictWork, type RatingState } from '../../lib/annict'
import { fetchCovers, quickCovers } from '../../lib/covers'
import type { GithubConnection } from '../../lib/github'
import { getMyReviews, peekMyReview, rememberReview } from '../../lib/myReviews'
import { loadStoredSeasonWorks } from '../../lib/offlineCache'
import { changeRating } from '../../lib/reviewOps'
import { nextSeason, previousSeason, seasonOf, toSlug, type Season } from '../../lib/season'
import { loadBackfillSeason, saveBackfillSeason } from '../../lib/storage'
import { useCoalescedTask } from '../../lib/useCoalescedTask'
import { messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import { rememberSeasonTop } from '../achievements/achievementStore'
import { markStillWatching, unmarkStillWatching } from './stillWatching'
import { activeUnseenIds } from './unseen'
import { loadLocalUnseen, setUnseen, syncUnseen } from './unseenStore'
import { OLDEST_YEAR, pickQueue, toCards, type Answer, type Card } from './queue'

interface UndoEntry {
  card: Card
  answer: Answer
  index: number
  // 評価を付けたときの、付ける前の総合評価（null は評価なし。取り消しで戻す）。送信で読んだときに埋まる。
  // 取り消しの送信は同じ列の後ろに並ぶので、実行時には（評価を送るところまで進んでいれば）埋まっている
  before?: RatingState | null
  // 答えた時点で手元の控えから見た、付ける前の総合評価（閉じて開き直したあとの取り消しの送り直しに使う。lib/writeJournal.ts）
  guess: RatingState | null
  // 「見てない」の見直しの山で答えた（もともと「見てない」にしていた作品）
  wasUnseen: boolean
}

// クールの作品のうち、まだ記録が無く「見てない」にしている作品（見直しの山にする）
export function unseenInSeason(works: readonly AnnictWork[], unseen: ReadonlySet<number>): AnnictWork[] {
  return works.filter((w) => (w.viewerStatusState ?? 'NO_STATE') === 'NO_STATE' && unseen.has(w.annictId))
}

// 答え始めた山に、読み直したクールの作品を合わせる。答えた分といま出している1枚はそのまま、まだ出していない分は読み直した山
// （もう記録済みの作品は入っていない）に入れ替える
export function mergeBackfillDeck(cur: readonly Card[], index: number, fresh: readonly Card[]): Card[] {
  const kept = cur.slice(0, index + 1)
  const keptIds = new Set(kept.map((c) => c.work.id))
  return [...kept, ...fresh.filter((c) => !keptIds.has(c.work.id))]
}

export function useBackfill(token: string, github: GithubConnection | null = null) {
  const [season, setSeason] = useState<Season>(() => loadBackfillSeason() ?? seasonOf(new Date()))
  const [cards, setCards] = useState<Card[] | null>(null)
  // そのクールの人気作の数（記録済みも含む）。進み具合の分母
  const [total, setTotal] = useState(0)
  const [index, setIndex] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const { pending, failed, enqueue, retryFailed, dismissFailed } = useWriteQueue()
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  // 端末にとっておいた前回の内容で山を出しているあいだの、その内容の日時（読み直したら null）と、読み直しの失敗
  const [staleAt, setStaleAt] = useState<string | null>(null)
  const [staleError, setStaleError] = useState<string | null>(null)
  const staleRef = useRef(false)
  const indexRef = useRef(0)
  useEffect(() => {
    staleRef.current = staleAt !== null
    indexRef.current = index
  })
  // 「見てない」を GitHub と合わせたつなぎ（デッキを読むたびには合わせない。押したときの同期は別。つなぎ先が変われば合わせ直す）
  const synced = useRef<GithubConnection | null>(null)
  // 山を読むときのつなぎ先。山の読み込みは、つなぎ先が変わっても読み直さない（答えている途中の山と位置を崩さない。2026-10-06 の点検）
  const githubRef = useRef(github)
  useEffect(() => {
    githubRef.current = github
  })
  // 記録済みで空のクールを、前のクールへ自動で飛ばすか。次のクールへ進んだときは飛ばさず、空だと見せる（戻されないように）
  const skipEmpty = useRef(true)
  // 次の読み込みで、クールの作品の控え（lib/annict.ts の5分の控え）を使わない（「もう一度読み込む」）
  const freshNext = useRef(false)
  // このクールの人気作（記録済みも含む）。「見てない」にした作品の見直しに使う
  const [seasonWorks, setSeasonWorks] = useState<AnnictWork[] | null>(null)
  // 「見てない」の見直しの山を、いまの山のどこから足したか（見直していなければ null）。
  // 見直しは、クールを終えた画面で利用者が押したときだけ（勝手に山へ戻さない。押した答えを尊重する）
  const [reviewFrom, setReviewFrom] = useState<number | null>(null)
  const reviewFromRef = useRef<number | null>(null)
  useEffect(() => {
    reviewFromRef.current = reviewFrom
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // まず端末にとっておいた前回のこのクールの作品で山を出す（Annict が重い日でもすぐ出す。2026-10-06）。
      // 答える作品が無ければ出さない（空のクールを飛ばすかどうかは、読み直してから決める）
      const stored = loadStoredSeasonWorks(toSlug(season))
      if (stored) {
        const queue = pickQueue(stored.value, activeUnseenIds(loadLocalUnseen()))
        if (queue.length > 0) {
          setCards((cur) => cur ?? toCards(queue, quickCovers(queue)))
          setTotal(stored.value.length)
          setSeasonWorks(stored.value)
          setStaleAt(stored.at)
          staleRef.current = true
        }
      }
      try {
        // 「見てない」を他の端末と合わせる。失敗しても、この端末の記録で進める
        let unseen = loadLocalUnseen()
        const fresh = freshNext.current
        freshNext.current = false
        const worksPromise = fetchSeasonWorks(token, toSlug(season), undefined, { fresh })
        // 同期を待つあいだに失敗しても、未処理の拒否として扱われないように（失敗はあとの await で受ける）
        worksPromise.catch(() => undefined)
        const github = githubRef.current
        if (github && synced.current !== github) {
          try {
            unseen = await syncUnseen(github)
            synced.current = github
            if (!cancelled) setSyncNote(null)
          } catch (e) {
            if (!cancelled) setSyncNote(`GitHub と同期できませんでした（${messageOf(e)}）。この端末の記録だけで進めます。`)
          }
        }
        const all = await worksPromise
        // 実績の計算（クールの網羅）のために、このクールの人気作の一覧も控える
        rememberSeasonTop(toSlug(season), all.map((w) => w.annictId))
        const works = pickQueue(all, activeUnseenIds(unseen))
        if (cancelled) return
        // 前回の内容で山を出していたら、いま出している1枚までは残し、まだ出していない分だけ読み直した山にする
        // （画面の作品を急に入れ替えない。空になっても、前のクールへ勝手に飛ばさない）
        if (staleRef.current) {
          const covers = await fetchCovers(works)
          if (cancelled) return
          setTotal(all.length)
          setSeasonWorks(all)
          // 見直しの山を足していたら、山はそのまま（読み直した山で見直しの分を消さない）
          if (reviewFromRef.current === null) setCards((cur) => mergeBackfillDeck(cur ?? [], indexRef.current, toCards(works, covers)))
          setStaleAt(null)
          setStaleError(null)
          return
        }
        if (works.length === 0) {
          // 人気作をすべて記録済みのクールは飛ばす
          const prev = previousSeason(season)
          if (!skipEmpty.current) {
            setTotal(all.length)
            setSeasonWorks(all)
            setCards([])
          } else if (prev.year < OLDEST_YEAR) {
            setFinished(true)
          } else {
            saveBackfillSeason(prev)
            setSeason(prev)
          }
          return
        }
        const covers = await fetchCovers(works)
        if (cancelled) return
        setTotal(all.length)
        setSeasonWorks(all)
        setCards(toCards(works, covers))
      } catch (e) {
        if (cancelled) return
        // 前回の内容で山を出しているなら、そのまま答えられるので知らせるだけ（山は消さない）
        if (staleRef.current) setStaleError(messageOf(e))
        else setLoadError(messageOf(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, season, reloadTick])

  // 使っている途中で GitHub とつないだ・つなぎ先を変えたら、「見てない」だけを合わせる（山はそのまま）
  const mountedGithub = useRef(github)
  useEffect(() => {
    if (!github || github === mountedGithub.current || synced.current === github) return
    let cancelled = false
    syncUnseen(github).then(
      () => {
        synced.current = github
        if (!cancelled) setSyncNote(null)
      },
      (e: unknown) => !cancelled && setSyncNote(`GitHub と同期できませんでした（${messageOf(e)}）。この端末の記録だけで進めます。`),
    )
    return () => {
      cancelled = true
    }
  }, [github])

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
    setStaleAt(null)
    setStaleError(null)
    staleRef.current = false
    undoStack.current = []
    setUndoCount(0)
    setSeasonWorks(null)
    setReviewFrom(null)
    setSeason(next)
  }, [])

  const reload = useCallback(() => {
    freshNext.current = true
    setLoadError(null)
    setStaleError(null)
    // 前回の内容で山を出しているなら、それを見せたまま読み直す
    if (!staleRef.current) setCards(null)
    setReloadTick((t) => t + 1)
  }, [])

  const answer = useCallback(
    (a: Answer) => {
      if (!cards || index >= cards.length) return
      const card = cards[index]
      const wasUnseen = reviewFrom !== null && index >= reviewFrom
      const entry: UndoEntry = { card, answer: a, index, guess: peekMyReview(token, card.work.annictId)?.ratingOverallState ?? null, wasUnseen }
      undoStack.current.push(entry)
      setUndoCount(undoStack.current.length)
      setIndex(index + 1)
      if (a.kind === 'skip') {
        // 見直しでもう一度「見てない」なら、そのまま（日時だけ新しくする）
        setUnseen(card.work.annictId, true)
        syncLater()
        return
      }
      // 見直しで記録したら、もう「見てない」ではない
      if (wasUnseen) {
        setUnseen(card.work.annictId, false)
        syncLater()
      }
      // 「見てる」と答えた作品は、「まだ見てる」と同じく、答えたクールのあいだは「見終わりましたか」と聞かない
      // （2026-10-06 の点検: 古いクールの作品に「見てる」と答えると、次に開いたときすぐ聞いていた。stillWatching.ts）
      if (a.kind === 'watching') markStillWatching(card.work.annictId)
      const state = a.kind === 'wanna' ? 'WANNA_WATCH' : a.kind === 'watching' ? 'WATCHING' : a.kind === 'stop' ? 'STOP_WATCHING' : 'WATCHED'
      const { id: workId, annictId } = card.work
      enqueue(
        `「${card.work.title}」の記録`,
        async () => {
          await updateStatus(token, workId, state)
          if (a.kind !== 'rate') return
          // 前回の内容の山には、別の端末で評価済みの作品が混ざることがある。送信の時点の実際の感想から付ける（感想がすでにあれば、新しく作らずに付け直す）
          const current = (await getMyReviews(token)).get(annictId) ?? null
          entry.before = current?.ratingOverallState ?? null
          await rememberReview(token, annictId, await changeRating(token, workId, current, a.rating))
        },
        [{ kind: 'status', workId, state }, ...(a.kind === 'rate' ? [{ kind: 'rating' as const, workId, annictId, rating: a.rating }] : [])],
      )
    },
    [cards, index, token, enqueue, syncLater, reviewFrom],
  )

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    setIndex(entry.index)
    if (entry.answer.kind === 'skip') {
      // 見直しの山の作品は、もともと「見てない」だった。戻しても「見てない」のまま
      if (!entry.wasUnseen) {
        setUnseen(entry.card.work.annictId, false)
        syncLater()
      }
      return
    }
    if (entry.wasUnseen) {
      setUnseen(entry.card.work.annictId, true)
      syncLater()
    }
    if (entry.answer.kind === 'watching') unmarkStillWatching(entry.card.work.annictId)
    // 列に並んでいる作品は、もともと何も記録していなかったものだけなので「未設定」に戻せばよい
    const { id: workId, annictId } = entry.card.work
    const rated = entry.answer.kind === 'rate'
    enqueue(
      `「${entry.card.work.title}」の取り消し`,
      async () => {
        // 評価を付けていたら、付ける前の評価に戻す（無かったなら消す）
        if (entry.before !== undefined) {
          const current = (await getMyReviews(token)).get(annictId) ?? null
          await rememberReview(token, annictId, await changeRating(token, workId, current, entry.before))
        }
        entry.before = undefined
        await updateStatus(token, workId, 'NO_STATE')
      },
      [{ kind: 'status', workId, state: 'NO_STATE' }, ...(rated ? [{ kind: 'rating' as const, workId, annictId, rating: entry.before ?? entry.guess }] : [])],
    )
  }, [token, enqueue, syncLater])

  // 関連作品のシートで記録した作品を、これから出てくる山から外す（もう答えてあるので、二度聞かない）。
  // keepCurrent なら、いま出している1枚は残す（画面に出ている作品を急に入れ替えない）
  const dropFromDeck = useCallback(
    (annictId: number, keepCurrent: boolean) => {
      setCards((cur) => {
        if (!cur) return cur
        const from = keepCurrent ? index + 1 : index
        const at = cur.findIndex((c, i) => i >= from && c.work.annictId === annictId)
        return at < 0 ? cur : cur.filter((_, i) => i !== at)
      })
    },
    [index],
  )

  const current = cards && index < cards.length ? cards[index] : null
  const next = cards && index + 1 < cards.length ? cards[index + 1] : null
  const seasonDone = cards !== null && index >= cards.length
  // クールを終えた画面でだけ数える（端末の「見てない」を読む）
  const unseenLeft = seasonDone && seasonWorks ? unseenInSeason(seasonWorks, activeUnseenIds(loadLocalUnseen())) : []

  // 「見てない」にした作品を、いまの山の後ろに足して見直す（押したときだけ）
  const reviewUnseen = () => {
    if (!cards || unseenLeft.length === 0) return
    const list = unseenLeft
    setReviewFrom(cards.length)
    setCards([...cards, ...toCards(list, quickCovers(list))])
    fetchCovers(list)
      .then((covers) => setCards((cur) => cur && cur.map((c) => (c.cover ? c : { ...c, cover: covers.get(c.work.annictId) ?? null }))))
      .catch(() => undefined)
  }

  return {
    season,
    cards,
    staleAt,
    staleError,
    index,
    // 進み具合: そのクールの人気作のうち、答えた数（Annict に記録があるか「見てない」にした作品。今回答えた分を含む）。
    // 見直しの山は、どれも答え済み（「見てない」）なので満たしたまま
    progress: cards ? { answered: reviewFrom !== null ? total : total - cards.length + index, total } : null,
    current,
    next,
    seasonDone,
    // 「見てない」の見直しの山を答えているか・答え終えたか
    reviewing: reviewFrom !== null,
    // クールを終えた画面で出す「見てないにした作品を見直す」の本数
    unseenLeft: unseenLeft.length,
    reviewUnseen,
    finished,
    loadError,
    syncNote,
    pending,
    failed,
    canUndo: undoCount > 0,
    answer,
    undo,
    reload,
    // 関連作品のシートの送信もこの列に並べる（失敗は評価画面の帯に出る）
    enqueue,
    dropFromDeck,
    retryFailed,
    dismissFailed,
    goToPrevious: () => goToSeason(previousSeason(season)),
    goToNext: () => goToSeason(nextSeason(season), true),
    // プルダウンで選んだクールへ。› と同じく、記録済みで空でも、選んだクールをそのまま見せる（前へ自動で飛ばさない）
    jumpTo: (target: Season) => goToSeason(target, true),
  }
}
