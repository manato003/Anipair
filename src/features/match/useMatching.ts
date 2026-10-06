import { useCallback, useMemo, useRef, useState } from 'react'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import type { GithubConnection } from '../../lib/github'
import { annictSearchUrl, updateStatus, type RatingState, type WorkRef } from '../../lib/annict'
import { changeRating } from '../../lib/reviewOps'
import { fetchMedia, type Media } from '../../lib/shikimori'
import { loadMatchFilterRaw, saveMatchFilterRaw } from '../../lib/storage'
import { useCoalescedTask } from '../../lib/useCoalescedTask'
import { WriteError, messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import { activePassIds } from './passes'
import { loadLocalPasses, setPass, syncPasses } from './passStore'
import { resolveAnnictWork } from './resolve'
import { isDefaultFilter, parseMatchFilter, type MatchFilter } from './matchFilter'
import { collectPool, malIdOf, rankCandidates, seenMalIds } from './taste'
import { forgetTaste, loadTaste } from './tasteLoader'

// 候補の詳しい情報を取るのは、似ている度合いの強い順にこの件数まで（Shikimori 1回ぶん）。
// 形式や放送年で絞っているときは、絞ったあとにも候補が残るように2回ぶん取る
const POOL_SIZE = 50
const FILTERED_POOL_SIZE = 100
const MAX_CARDS = 30

// wanna: 見たい / pass: パス（3ヶ月出さない）/ skip: スルー（今は決めない。1週間後にまた出す）/
// rate: 見たことがあって評価する / watched: 見たことがあるが覚えていない / watching: いま見ている / stop: 途中でやめた（視聴中断。Annict には STOP_WATCHING）
export type MatchAnswer =
  | { kind: 'wanna' }
  | { kind: 'pass' }
  | { kind: 'skip' }
  | { kind: 'rate'; rating: RatingState }
  | { kind: 'watched' }
  | { kind: 'watching' }
  | { kind: 'stop' }

export interface MatchCard {
  media: Media
  reasons: string[]
}

export type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; step: string }
  | { kind: 'ready' }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string }

interface UndoEntry {
  card: MatchCard
  answer: MatchAnswer
  index: number
  // 送信で Annict の作品が特定できたら埋まる
  ref: WorkRef | null
  // 評価を送るところまで進んだら true（取り消しで評価を外す）
  rated: boolean
}

export function titleOf(m: Media): string {
  return m.title.native ?? m.title.romaji ?? m.title.english ?? `MAL ${m.idMal}`
}

export function useMatching(annictToken: string, github: GithubConnection | null) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [cards, setCards] = useState<MatchCard[]>([])
  const [index, setIndex] = useState(0)
  const [basis, setBasis] = useState<{ rated: number; liked: number } | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const { pending, failed, enqueue, retryFailed, dismissFailed } = useWriteQueue()
  const undoStack = useRef<UndoEntry[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const runId = useRef(0)
  // 絞り込み条件。変えても提案は作り直さない（次に提案するときに効く）。run が読むので ref にも持つ
  const [filter, setFilterState] = useState<MatchFilter>(() => parseMatchFilter(loadMatchFilterRaw()))
  const filterRef = useRef(filter)
  // 候補（MAL の ID）ごとの、Annict の作品を探す問い合わせ。詳細のシートと「見たい」などの送信で使い回す
  const resolved = useRef(new Map<number, Promise<WorkRef | null>>())

  const run = useCallback(async () => {
    const id = ++runId.current
    const alive = () => runId.current === id
    setCards([])
    setIndex(0)
    resolved.current = new Map()
    undoStack.current = []
    setUndoCount(0)
    const filter = filterRef.current
    // 提案を作るたびに好みを読み直す（評価が増えたあとでも、新しい好みで提案できるように）。読んだ好みは、記録ページの傾向などが使い回す
    forgetTaste()
    setPhase({ kind: 'loading', step: 'Annict の記録を読み込み中' })
    try {
      const { library, ratings, seeds, similarSeeds, similar, profile } = await loadTaste(annictToken, (step) => {
        if (alive()) setPhase({ kind: 'loading', step })
      })
      if (!alive()) return
      const liked = seeds.filter((s) => s.weight > 0).length
      setBasis({ rated: ratings.size, liked })
      if (liked === 0) {
        setPhase({ kind: 'empty', message: '好きな作品の記録がまだありません。評価画面で、見た作品を「良い」か「とても良い」で評価してください。' })
        return
      }

      let passes = loadLocalPasses()
      if (github) {
        setPhase({ kind: 'loading', step: 'パスした作品を GitHub から読み込み中' })
        try {
          passes = await syncPasses(github)
          setSyncNote(null)
        } catch (e) {
          setSyncNote(`GitHub と同期できませんでした（${messageOf(e)}）。この端末の記録だけで進めます。`)
        }
        if (!alive()) return
      }

      const recorded = library.map(malIdOf).filter((n): n is number => n !== null)
      const exclude = new Set([...recorded, ...activePassIds(passes, new Date())])
      const pool = collectPool(similarSeeds, similar, exclude).slice(0, isDefaultFilter(filter) ? POOL_SIZE : FILTERED_POOL_SIZE)

      setPhase({ kind: 'loading', step: '候補を整理しています' })
      const details = await fetchMedia(pool.map((p) => p.malId))
      if (!alive()) return
      const ranked = rankCandidates(pool, details, profile, seenMalIds(library), filter).slice(0, MAX_CARDS)
      if (ranked.length === 0) {
        setPhase({
          kind: 'empty',
          message: isDefaultFilter(filter)
            ? '今の記録からは候補が見つかりませんでした。評価した作品が増えると候補が広がります。'
            : '条件に合う候補が見つかりませんでした。形式や放送年の条件をゆるめてみてください。',
        })
        return
      }
      setCards(ranked.map((c) => ({ media: c.media, reasons: c.reasons })))
      setPhase({ kind: 'ready' })
    } catch (e) {
      if (alive()) setPhase({ kind: 'error', message: messageOf(e) })
    }
  }, [annictToken, github])

  const setFilter = useCallback((next: MatchFilter) => {
    filterRef.current = next
    setFilterState(next)
    saveMatchFilterRaw(next)
  }, [])

  // 候補に当たる Annict の作品を探す（見つからなければ null）。同じ候補は1回しか探さない。
  // 見つからなかったときと失敗したときは覚えない（Annict で登録したあとの再送や、通信の失敗からの再試行で探し直せるように）
  const resolveCard = useCallback(
    (card: MatchCard): Promise<WorkRef | null> => {
      const key = card.media.idMal
      const memo = resolved.current
      let p = memo.get(key)
      if (!p) {
        const fresh = resolveAnnictWork(annictToken, card.media)
        p = fresh
        memo.set(key, fresh)
        const forget = () => {
          if (memo.get(key) === fresh) memo.delete(key)
        }
        fresh.then((ref) => {
          if (!ref) forget()
        }, forget)
      }
      return p
    },
    [annictToken],
  )

  // 始まる前の同期はまとめる（詳しくは useCoalescedTask）
  const syncRun = useMemo(() => (github ? async () => void (await syncPasses(github)) : null), [github])
  const syncLater = useCoalescedTask(enqueue, 'パス・スルーの記録の GitHub への保存', syncRun)

  const answer = useCallback(
    (a: MatchAnswer) => {
      if (index >= cards.length) return
      const card = cards[index]
      const entry: UndoEntry = { card, answer: a, index, ref: null, rated: false }
      undoStack.current.push(entry)
      setUndoCount(undoStack.current.length)
      setIndex(index + 1)
      if (a.kind === 'pass' || a.kind === 'skip') {
        setPass(card.media.idMal, true, { kind: a.kind })
        syncLater()
        return
      }
      const title = titleOf(card.media)
      const label =
        a.kind === 'wanna' ? `「${title}」の見たいへの追加` : a.kind === 'watching' ? `「${title}」の見てるへの追加` : `「${title}」の記録`
      const state = a.kind === 'wanna' ? 'WANNA_WATCH' : a.kind === 'watching' ? 'WATCHING' : a.kind === 'stop' ? 'STOP_WATCHING' : 'WATCHED'
      enqueue(
        label,
        async () => {
          entry.ref ??= await resolveCard(card)
          if (!entry.ref) {
            throw new WriteError(`「${title}」を Annict で見つけられませんでした。`, {
              href: annictSearchUrl(title),
              text: 'Annict で探して登録する',
            })
          }
          await updateStatus(annictToken, entry.ref.id, state)
          if (a.kind === 'rate') {
            entry.rated = true
            // 共有の感想の控えから付ける（作った感想は控えにも入る。あとで詳細のシートから評価を変えたときに見つけられるように）
            const current = (await getMyReviews(annictToken)).get(entry.ref.annictId) ?? null
            await rememberReview(annictToken, entry.ref.annictId, await changeRating(annictToken, entry.ref.id, current, a.rating))
          }
        },
        [{ kind: 'match', idMal: card.media.idMal, title: card.media.title, state, ...(a.kind === 'rate' ? { rating: a.rating } : {}) }],
      )
    },
    [cards, index, annictToken, enqueue, syncLater, resolveCard],
  )

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    setUndoCount(undoStack.current.length)
    setIndex(entry.index)
    if (entry.answer.kind === 'pass' || entry.answer.kind === 'skip') {
      setPass(entry.card.media.idMal, false, { kind: entry.answer.kind })
      syncLater()
      return
    }
    // 候補は記録の無い作品だけなので「未設定」に戻せばよい。Annict で特定できていなければ何も書いていない
    const { media } = entry.card
    enqueue(
      `「${titleOf(media)}」の取り消し`,
      async () => {
        const ref = entry.ref
        if (!ref) return
        if (entry.rated) {
          const current = (await getMyReviews(annictToken)).get(ref.annictId) ?? null
          await rememberReview(annictToken, ref.annictId, await changeRating(annictToken, ref.id, current, null))
        }
        entry.rated = false
        await updateStatus(annictToken, ref.id, 'NO_STATE')
      },
      [{ kind: 'match', idMal: media.idMal, title: media.title, state: 'NO_STATE', ...(entry.answer.kind === 'rate' ? { rating: null } : {}) }],
    )
  }, [annictToken, enqueue, syncLater])

  // 関連作品のシートで記録した作品を、これから出てくる候補から外す（いま出している候補は残す）
  const dropCandidate = useCallback(
    (malId: number) => {
      setCards((cur) => {
        const at = cur.findIndex((c, i) => i > index && c.media.idMal === malId)
        return at < 0 ? cur : cur.filter((_, i) => i !== at)
      })
    },
    [index],
  )

  const current = index < cards.length ? cards[index] : null
  const next = index + 1 < cards.length ? cards[index + 1] : null

  return {
    phase,
    cards,
    index,
    current,
    next,
    done: phase.kind === 'ready' && index >= cards.length,
    basis,
    syncNote,
    pending,
    failed,
    canUndo: undoCount > 0,
    run,
    filter,
    setFilter,
    resolveCard,
    answer,
    undo,
    // 関連作品のシートの送信もこの列に並べる（失敗はマッチングの帯に出る）
    enqueue,
    dropCandidate,
    retryFailed,
    dismissFailed,
  }
}
