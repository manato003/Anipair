import { useCallback, useEffect, useRef, useState } from 'react'
import { createRecord, deleteRecord, fetchEpisodes, type Episode, type RatingState, type WorkEpisodes } from '../../lib/annict'
import { messageOf } from '../../lib/useWriteQueue'
import { episodeLabel } from './episodes'

type Enqueue = (label: string, task: () => Promise<void>) => void

// 記録ページで開いた作品（見た・見てる）の話の一覧と、話ごとの記録（4段階の評価つき）。
// 開いた作品の分だけ、まだ読んでいないものを読み足す（閉じても控えは残す）。記録は画面に先に映してから、書き込みの列（enqueue）で送る。
// 取り消せるのは、この画面で付けた記録だけ（Annict の API には、過去の自分の記録を作品ごとに引く手段が無いため）
export function useEpisodes(token: string, workIds: readonly string[], enqueue: Enqueue) {
  const [byWork, setByWork] = useState<ReadonlyMap<string, WorkEpisodes>>(new Map())
  // 読めなかった作品と、その理由
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  // 読んでいる最中の作品（同じ作品を二重に読まない）
  const loading = useRef(new Set<string>())
  const [reloadTick, setReloadTick] = useState(0)
  // この画面で付けた記録の ID（話の ID ごと。送り終わるまでは待ちの Promise。送れなければ null）
  const recordIds = useRef(new Map<string, Promise<string | null>>())
  const [undoable, setUndoable] = useState<ReadonlySet<string>>(new Set())

  const missing = workIds.filter((id) => !byWork.has(id) && !errors.has(id))
  const missingKey = [...new Set(missing)].sort().join(',')

  useEffect(() => {
    const ids = missingKey ? missingKey.split(',').filter((id) => !loading.current.has(id)) : []
    if (ids.length === 0) return
    for (const id of ids) loading.current.add(id)
    fetchEpisodes(token, ids).then(
      (got) => {
        for (const id of ids) loading.current.delete(id)
        setByWork((cur) => {
          const next = new Map(cur)
          for (const [id, w] of got) next.set(id, w)
          return next
        })
      },
      (e) => {
        for (const id of ids) loading.current.delete(id)
        const message = messageOf(e)
        setErrors((cur) => {
          const next = new Map(cur)
          for (const id of ids) next.set(id, message)
          return next
        })
      },
    )
  }, [token, missingKey, reloadTick])

  const patchEpisode = useCallback((workId: string, episodeId: string, delta: 1 | -1) => {
    setByWork((cur) => {
      const work = cur.get(workId)
      if (!work) return cur
      const episodes = work.episodes.map((e) => {
        if (e.id !== episodeId) return e
        const count = Math.max(0, e.viewerRecordsCount + delta)
        return { ...e, viewerRecordsCount: count, viewerDidTrack: count > 0 }
      })
      return new Map(cur).set(workId, { ...work, episodes })
    })
  }, [])

  const record = useCallback(
    (title: string, workId: string, episode: Episode, rating: RatingState | null) => {
      patchEpisode(workId, episode.id, 1)
      let resolveId: (id: string | null) => void = () => undefined
      recordIds.current.set(episode.id, new Promise((resolve) => (resolveId = resolve)))
      setUndoable((cur) => new Set(cur).add(episode.id))
      enqueue(`「${title}」${episodeLabel(episode)}の記録`, async () => {
        try {
          resolveId(await createRecord(token, episode.id, rating))
        } catch (e) {
          resolveId(null)
          throw e
        }
      })
    },
    [token, enqueue, patchEpisode],
  )

  const undo = useCallback(
    (title: string, workId: string, episode: Episode) => {
      const pending = recordIds.current.get(episode.id)
      if (!pending) return
      recordIds.current.delete(episode.id)
      setUndoable((cur) => {
        const next = new Set(cur)
        next.delete(episode.id)
        return next
      })
      patchEpisode(workId, episode.id, -1)
      enqueue(`「${title}」${episodeLabel(episode)}の記録の取り消し`, async () => {
        const id = await pending
        // 送れていなかった記録は、消すものが無い
        if (id) await deleteRecord(token, id)
      })
    },
    [token, enqueue, patchEpisode],
  )

  return {
    byWork,
    errors,
    undoable,
    record,
    undo,
    // 読めなかった作品を、もう一度読む
    retry: () => {
      setErrors(new Map())
      setReloadTick((t) => t + 1)
    },
  }
}
