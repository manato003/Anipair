import { annictMissingLinks, fetchRecentActivity, updateRecord, updateStatus } from '../../lib/annict'
import { getMyReviews, rememberReview } from '../../lib/myReviews'
import { changeRating, saveReview } from '../../lib/reviewOps'
import { createRecordGuarded, deleteRecordIfExists, findMyRecord, MARGIN_MS } from '../../lib/uncertainWrites'
import { WriteError } from '../../lib/useWriteQueue'
import type { WriteIntent } from '../../lib/writeJournal'
import { resolveAnnictWork } from '../match/resolve'

// 前回送れなかった書き込みの行き先（lib/writeJournal.ts）を、Annict の今の状態と比べて、足りない分だけ書く。
// 何度送っても同じ結果になる（状態は同じ値を書くだけ。感想は今の感想から変える。話の記録は、頼んだあとの記録があるかを見てから作る・消す）
export async function reconcileIntent(token: string, intent: WriteIntent): Promise<void> {
  switch (intent.kind) {
    case 'status':
      await updateStatus(token, intent.workId, intent.state)
      return
    case 'rating': {
      const current = (await getMyReviews(token)).get(intent.annictId) ?? null
      await rememberReview(token, intent.annictId, await changeRating(token, intent.workId, current, intent.rating))
      return
    }
    case 'review': {
      const current = (await getMyReviews(token)).get(intent.annictId) ?? null
      await rememberReview(token, intent.annictId, await saveReview(token, intent.workId, current, intent.content))
      return
    }
    case 'episode': {
      const { records } = await fetchRecentActivity(token, intent.since - MARGIN_MS)
      const found = records.find((r) => r.episodeId === intent.episodeId)
      if (intent.recorded && !found) await createRecordGuarded(token, intent.episodeId, intent.rating, intent.comment)
      if (!intent.recorded && found) await deleteRecordIfExists(token, found.id)
      return
    }
    case 'episodeComment': {
      // 記録が無ければ（取り消した・作れなかった）付ける先が無い。記録を作る行き先は先に送っている（頼んだ順）
      const id = await findMyRecord(token, intent.episodeId, intent.since)
      if (id) await updateRecord(token, id, intent.comment, intent.rating)
      return
    }
    case 'match': {
      const ref = await resolveAnnictWork(token, intent)
      const title = intent.title.native ?? intent.title.english ?? intent.title.romaji ?? ''
      if (!ref) throw new WriteError(`「${title}」を Annict で見つけられませんでした。`, annictMissingLinks(title))
      await updateStatus(token, ref.id, intent.state)
      if (intent.rating === undefined) return
      const current = (await getMyReviews(token)).get(ref.annictId) ?? null
      await rememberReview(token, ref.annictId, await changeRating(token, ref.id, current, intent.rating))
      return
    }
  }
}
