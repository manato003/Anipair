import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEpisodes, type Episode, type RatingState, type WorkEpisodes } from '../../lib/annict'
import { findMyEpisodeRecord, updateRecord } from '../../lib/annict'
import { createRecordGuarded, deleteRecordIfExists, findMyRecord, resolveUncertainRecord } from '../../lib/uncertainWrites'
import { WriteError, messageOf } from '../../lib/useWriteQueue'
import { findPastRecord, forgetPastRecords, type PastRecord } from '../../lib/pastRecords'
import type { WriteIntent } from '../../lib/writeJournal'
import { episodeLabel } from './episodes'
import { t } from '../../lib/i18n'

type Enqueue = (label: string, task: () => Promise<void>, intents?: readonly WriteIntent[]) => void

// 作品の詳細のシートで開いた作品（見た・見てる）の話の一覧と、話ごとの記録（4段階の評価つき）。
// 開いた作品の分だけ、まだ読んでいないものを読み足す（閉じても控えは残す）。記録は画面に先に映してから、書き込みの列（enqueue）で送る。
// 取り消せるのは、この画面で付けた記録だけ（Annict の API には、過去の自分の記録を作品ごとに引く手段が無いため）
export type EpisodesController = ReturnType<typeof useEpisodes>

export function useEpisodes(token: string, workIds: readonly string[], enqueue: Enqueue) {
  const [byWork, setByWork] = useState<ReadonlyMap<string, WorkEpisodes>>(new Map())
  // 読めなかった作品と、その理由
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  // 読んでいる最中の作品（同じ作品を二重に読まない）
  const loading = useRef(new Set<string>())
  const [reloadTick, setReloadTick] = useState(0)
  // この画面で付けた記録の ID（話の ID ごと。送り終わるまでは待ちの Promise。送れなければ null）
  const recordIds = useRef(new Map<string, Promise<string | null>>())
  // 記録を頼んだ時刻（話の ID ごと。閉じて開き直したあとの取り消しの送り直しで、それより新しい記録を探す）
  const recordedAt = useRef(new Map<string, number>())
  const [undoable, setUndoable] = useState<ReadonlySet<string>>(new Set())
  // この画面で付けた記録のうち、感想を付けた話（「感想を書く」を「感想を直す」にする）
  const [commented, setCommented] = useState<ReadonlySet<string>>(new Set())
  // 記録済みの話の前回の記録（話の ID ごと。探している間は 'loading'、読める範囲に無い・読めなければ null）。記録欄で選んだときに探す
  const [past, setPast] = useState<ReadonlyMap<string, PastRecord | null | 'loading'>>(new Map())
  const lookupPast = useCallback(
    (episodeId: string) => {
      setPast((cur) => (cur.has(episodeId) ? cur : new Map(cur).set(episodeId, 'loading')))
      findPastRecord(token, episodeId).then(
        (found) => setPast((cur) => new Map(cur).set(episodeId, found)),
        () => setPast((cur) => new Map(cur).set(episodeId, null)),
      )
    },
    [token],
  )
  // 記録を付けた・取り消したら、前回の記録の控えを捨てる（いちばん新しい記録が変わるため）
  const forgetPast = useCallback(() => {
    forgetPastRecords()
    setPast(new Map())
  }, [])

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
    (title: string, workId: string, episode: Episode, rating: RatingState | null, comment?: string) => {
      patchEpisode(workId, episode.id, 1)
      forgetPast()
      if (comment) setCommented((cur) => new Set(cur).add(episode.id))
      let resolveId: (id: string | null) => void = () => undefined
      const created = new Promise<string | null>((resolve) => (resolveId = resolve))
      recordIds.current.set(episode.id, created)
      setUndoable((cur) => new Set(cur).add(episode.id))
      const since = Date.now()
      recordedAt.current.set(episode.id, since)
      enqueue(
        t(`「${title}」${episodeLabel(episode)}の記録`, `Record of “${title}” ${episodeLabel(episode)}`),
        async () => {
          try {
            // 前回の記録が届いたか分からない話なら、まず確かめる（二重に記録しない。lib/uncertainWrites.ts）
            const id = await createRecordGuarded(token, episode.id, rating, comment)
            resolveId(id)
            // 1回目が失敗して null に決まったあと、「もう一度」で届いたとき。取り消していなければ、届いた ID に差し替える
            // （差し替えないと、取り消しが消すものを知らず、Annict に記録が残る。2026-10-12 の総点検）
            if (recordIds.current.get(episode.id) === created) recordIds.current.set(episode.id, Promise.resolve(id))
          } catch (e) {
            resolveId(null)
            throw e
          }
        },
        [{ kind: 'episode', episodeId: episode.id, recorded: true, rating, since, ...(comment ? { comment } : {}) }],
      )
    },
    [token, enqueue, patchEpisode, forgetPast],
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
      forgetPast()
      setCommented((cur) => {
        const next = new Set(cur)
        next.delete(episode.id)
        return next
      })
      const since = recordedAt.current.get(episode.id) ?? Date.now()
      enqueue(
        t(`「${title}」${episodeLabel(episode)}の記録の取り消し`, `Undo record of “${title}” ${episodeLabel(episode)}`),
        async () => {
          // 送れていなかった記録は、消すものが無い。届いたか分からなかった記録は、届いていたら消す
          const id = (await pending) ?? (await resolveUncertainRecord(token, episode.id))
          if (id) await deleteRecordIfExists(token, id)
        },
        [{ kind: 'episode', episodeId: episode.id, recorded: false, rating: null, since }],
      )
    },
    [token, enqueue, patchEpisode, forgetPast],
  )

  // この画面で付けた記録に、感想を付ける（直す）。評価だけで記録したい人の手間は増やさない（書きたい人が、記録のあとに押す）
  const comment = useCallback(
    (title: string, episode: Episode, rating: RatingState | null, text: string) => {
      const pending = recordIds.current.get(episode.id)
      if (!pending) return
      setCommented((cur) => new Set(cur).add(episode.id))
      const since = recordedAt.current.get(episode.id) ?? Date.now()
      const label = episodeLabel(episode)
      enqueue(
        t(`「${title}」${label}の感想`, `Review of “${title}” ${label}`),
        async () => {
          // 記録の送信を待つ。送り直しで ID を受け取れなかったときは、自分の最近の記録から探す
          const id = (await pending) ?? (await resolveUncertainRecord(token, episode.id)) ?? (await findMyRecord(token, episode.id, since))
          if (!id) throw new WriteError(t(`${label}の記録がまだAnnictに届いていないので、感想を付けられませんでした。記録を送り直してから、もう一度試してください。`, `Couldn’t add a review because your record of ${label} hasn’t reached Annict yet. Resend the record, then try again.`))
          await updateRecord(token, id, text, rating)
        },
        [{ kind: 'episodeComment', episodeId: episode.id, comment: text, rating, since }],
      )
    },
    [token, enqueue],
  )

  // 前に（別の機会に）記録した話に、感想を付ける。自分の記録を探して、その評価のまま感想を足す。
  // 送り終えたら onSent（下書きを消す）。届かなければ下書きが残るので、書き込みの控え（ジャーナル）には載せない
  const commentExisting = useCallback(
    (title: string, episode: Episode, text: string, onSent: () => void) => {
      setCommented((cur) => new Set(cur).add(episode.id))
      const label = episodeLabel(episode)
      enqueue(t(`「${title}」${label}の感想`, `Review of “${title}” ${label}`), async () => {
        const found = await findMyEpisodeRecord(token, episode.id)
        if (!found) throw new WriteError(t(`${label}のあなたの記録が見つからず、感想を付けられませんでした（最近の500件まで探します）。下書きは残っています。`, `Couldn’t add a review because your record of ${label} wasn’t found (only your latest 500 records are searched). Your draft is still saved.`))
        await updateRecord(token, found.id, text, found.rating)
        onSent()
      })
    },
    [token, enqueue],
  )

  return {
    byWork,
    errors,
    undoable,
    commented,
    past,
    lookupPast,
    record,
    undo,
    comment,
    commentExisting,
    // 読めなかった作品を、もう一度読む
    retry: () => {
      setErrors(new Map())
      setReloadTick((t) => t + 1)
    },
  }
}
