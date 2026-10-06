import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { fetchLibrary, updateStatus, type RatingState, type StatusState } from '../../lib/annict'
import { getMyReviews, peekMyReviews, refreshMyReviews, rememberReview } from '../../lib/myReviews'
import { loadStoredLibrary } from '../../lib/offlineCache'
import { delay } from '../../lib/retry'
import { blankReview, changeRating } from '../../lib/reviewOps'
import type { Cover } from '../../lib/storage'
import { hasPendingWrites, messageOf, useWriteQueue } from '../../lib/useWriteQueue'
import type { RecordRow } from './recordList'

// ライブラリと自分の感想を読む。感想はブラウズの詳細と共有の控え（myReviews.ts）に差分だけ読み直して入れる
// （full は利用者が読み直しを求めたときだけ。全部を読み直す）。
// 何が現在の感想かは、この控えだけが持つ（送信のときもここから読む）
async function fetchRecords(token: string, full = false) {
  const library = await fetchLibrary(token)
  const myReviews = await refreshMyReviews(token, { full })
  return { library, myReviews }
}

type Fetched = Awaited<ReturnType<typeof fetchRecords>>

// covers を渡さなければ表紙は空（後から埋める）
// covers は Annict の作品 ID ごとの表紙
function toRows({ library, myReviews }: Fetched, covers?: Map<number, Cover>): RecordRow[] {
  return library.map((entry) => ({ entry, review: myReviews.get(entry.annictId) ?? null, cover: covers?.get(entry.annictId) ?? null }))
}

// 端末にとっておいた前回の内容（ライブラリと感想の控え）で作った一覧。無ければ null
function storedRows(token: string): { rows: RecordRow[]; at: string } | null {
  const lib = loadStoredLibrary()
  if (!lib) return null
  const fetched = { library: lib.value, myReviews: peekMyReviews(token) ?? new Map() }
  return { rows: toRows(fetched, quickCovers(lib.value)), at: lib.at }
}

// 送信待ちが無くなるまで待つ（前回の内容を見せているあいだに書き込んだら、書き込みが済んでから読み直す）
async function untilWritesDone(cancelled: () => boolean): Promise<void> {
  while (hasPendingWrites() && !cancelled()) await delay(500)
}

// active: 画面が表示されているか。隠れているだけで残っているとき、再び表示されたら裏で読み直す。
// 開いたらまず端末にとっておいた前回の内容で一覧を出し（staleAt にその日時）、Annict から読み直したら差し替える（2026-10-06）
export function useRecords(token: string, active = true) {
  const [initial] = useState(() => storedRows(token))
  const [rows, setRows] = useState<RecordRow[] | null>(() => initial?.rows ?? null)
  // 前回の内容を見せているあいだの、その内容の日時（読み直したら null）
  const [staleAt, setStaleAt] = useState<string | null>(() => initial?.at ?? null)
  // 前回の内容を見せたまま、読み直しに失敗したとき
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const { pending, failed, enqueue, retryFailed, dismissFailed } = useWriteQueue()
  const staleRef = useRef(staleAt !== null)
  useEffect(() => {
    staleRef.current = staleAt !== null
  })
  // 最初の読み込みが済んだか（済むまでは裏で読み直さない）
  const loaded = useRef(false)
  // 「もう一度読み込む」で読み直すときだけ、感想を全部読み直す（Annict のサイトでの変更に追いつくため）
  const fullNext = useRef(false)

  useEffect(() => {
    let cancelled = false
    const full = fullNext.current
    fullNext.current = false
    ;(async () => {
      try {
        let fetched = await fetchRecords(token, full)
        if (cancelled) return
        // 前回の内容を見せているあいだに書き込んでいたら、書き込みが済んでから読み直す（画面の先行表示を、書く前の中身で上書きしない）
        if (hasPendingWrites()) {
          await untilWritesDone(() => cancelled)
          if (cancelled) return
          fetched = await fetchRecords(token)
          if (cancelled) return
        }
        // Annict の画像はもう手元にあるので先に出し、Shikimori のポスターは後から埋める（件数が多いと問い合わせに時間がかかるため）
        setRows(toRows(fetched, quickCovers(fetched.library)))
        setStaleAt(null)
        setRefreshError(null)
        const covers = await fetchCovers(fetched.library)
        if (cancelled) return
        setRows((cur) => (cur ?? []).map((r) => ({ ...r, cover: covers.get(r.entry.annictId) ?? null })))
        // 表紙まで揃ってから。途中で裏の読み直しが走ると、後から来た表紙で上書きされてしまう
        loaded.current = true
      } catch (e) {
        if (cancelled) return
        // 前回の内容を見せているなら、それを見せたまま知らせる（一覧は消さない）
        if (staleRef.current) setRefreshError(messageOf(e))
        else setLoadError(messageOf(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, reloadTick])

  // 再び表示されたとき、いまの一覧を見せたまま裏で読み直して置き換える。
  // 送信待ちがあるあいだは、画面の先行表示を上書きしてしまうので読み直さない。
  // 他の画面の送信も同じ作品を変えているかもしれないので、アプリ全体の列を見る
  useEffect(() => {
    if (!active || !loaded.current || hasPendingWrites()) return
    let cancelled = false
    ;(async () => {
      try {
        const fetched = await fetchRecords(token)
        // 表紙は端末に控えがあるので、置き換えの時点で表紙が消えないように先に取る
        const covers = await fetchCovers(fetched.library)
        if (cancelled || hasPendingWrites()) return
        setRows(toRows(fetched, covers))
      } catch {
        // 裏の読み直しなので、失敗しても今の一覧をそのまま見せる（次に表示したときにまた試す）
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, token])

  const reload = useCallback(() => {
    loaded.current = false
    fullNext.current = true
    setRows(null)
    setStaleAt(null)
    setRefreshError(null)
    setLoadError(null)
    setReloadTick((t) => t + 1)
  }, [])

  // 前回の内容を見せたまま、もう一度 Annict から読み直す（一覧は消さない）
  const retryRefresh = useCallback(() => {
    setRefreshError(null)
    setReloadTick((t) => t + 1)
  }, [])

  const patchRow = useCallback((annictId: number, f: (r: RecordRow) => RecordRow | null) => {
    setRows((cur) => (cur ?? []).flatMap((r) => (r.entry.annictId === annictId ? (f(r) ?? []) : [r])))
  }, [])

  // 評価を付ける・変える・消す。評価を付けたら「見た」にする
  const setRating = useCallback(
    (row: RecordRow, rating: RatingState | null) => {
      const { annictId, workId, title } = row.entry
      const becomesWatched = rating !== null && row.entry.state !== 'WATCHED'
      patchRow(annictId, (r) => ({
        ...r,
        entry: becomesWatched ? { ...r.entry, state: 'WATCHED' } : r.entry,
        review: rating
          ? { ...(r.review ?? blankReview()), ratingOverallState: rating }
          : null,
      }))
      enqueue(
        `「${title}」の評価`,
        async () => {
          if (becomesWatched) await updateStatus(token, workId, 'WATCHED')
          // 画面の表示は先に変えるが、何を送るかは列の順番どおりに、この時点の実際の感想で決める
          const current = (await getMyReviews(token)).get(annictId) ?? null
          await rememberReview(token, annictId, await changeRating(token, workId, current, rating))
        },
        [...(becomesWatched ? [{ kind: 'status' as const, workId, state: 'WATCHED' as const }] : []), { kind: 'rating', workId, annictId, rating }],
      )
    },
    [token, enqueue, patchRow],
  )

  // 状態を変える。未設定にしたら一覧から外す
  const setState = useCallback(
    (row: RecordRow, state: StatusState) => {
      const { annictId, workId, title } = row.entry
      if (state === row.entry.state) return
      patchRow(annictId, (r) => (state === 'NO_STATE' ? null : { ...r, entry: { ...r.entry, state, stateAt: new Date().toISOString() } }))
      enqueue(
        `「${title}」の状態`,
        async () => {
          await updateStatus(token, workId, state)
        },
        [{ kind: 'status', workId, state }],
      )
    },
    [token, enqueue, patchRow],
  )

  // 詳細のシートで状態や評価を変えたときの、一覧の表示の合わせ。送信はシートが自分の列（enqueue）で行う。
  // 評価を付けるとシートが「見た」にするので、その状態も一緒に届く。状態が null（記録から外した）なら一覧から外す
  const patchRecord = useCallback(
    (annictId: number, patch: { state?: StatusState | null; rating?: RatingState | null }) => {
      const { state, rating } = patch
      patchRow(annictId, (r) => {
        if (state === null) return null
        return {
          ...r,
          entry: state ? { ...r.entry, state, stateAt: new Date().toISOString() } : r.entry,
          review: rating === undefined ? r.review : rating ? { ...(r.review ?? blankReview()), ratingOverallState: rating } : null,
        }
      })
    },
    [patchRow],
  )

  // 関連作品のシートで状態や評価を変えたとき。一覧にある作品なら行を合わせ、無い作品（新しく記録した）なら、一覧を空にせず裏で読み直して入れる
  const noteRelatedChange = useCallback(
    (annictId: number, patch: { state?: StatusState | null; rating?: RatingState | null }) => {
      if (rows?.some((r) => r.entry.annictId === annictId)) patchRecord(annictId, patch)
      else if (patch.state || patch.rating) setReloadTick((t) => t + 1)
    },
    [rows, patchRecord],
  )

  return { rows, staleAt, refreshError, retryRefresh, loadError, reload, pending, failed, enqueue, retryFailed, dismissFailed, setRating, setState, patchRecord, noteRelatedChange }
}
