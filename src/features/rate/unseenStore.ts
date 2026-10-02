import type { GithubConnection } from '../../lib/github'
import { clearLegacySkipped, loadLegacySkippedRaw, loadUnseenRaw, parseSkipped, saveUnseenRaw } from '../../lib/storage'
import { syncJson } from '../../lib/syncStore'
import { fromLegacy, mergeUnseen, parseUnseen, sameUnseen, serializeUnseen, type Unseen } from './unseen'

// 「見てない」の記録は端末に控えを持ち、GitHub につないでいれば、そのリポジトリの unseen.json と同期する
// （パスの passes.json とは別のファイル。passStore.ts と同じ仕組み）

const PATH = 'unseen.json'

function saveLocal(unseen: Unseen): void {
  saveUnseenRaw(serializeUnseen(unseen))
}

// 端末の控えを読む。旧形式（作品 ID の配列）が残っていれば、いまの控えに移してから旧形式を消す（1回だけ）
export function loadLocalUnseen(): Unseen {
  const current = parseUnseen(loadUnseenRaw())
  const legacy = loadLegacySkippedRaw()
  if (legacy === null) return current
  const merged = mergeUnseen(current, fromLegacy(parseSkipped(legacy)))
  saveLocal(merged)
  clearLegacySkipped()
  return merged
}

export function setUnseen(annictId: number, active: boolean, now: Date = new Date()): Unseen {
  const unseen = loadLocalUnseen()
  unseen.set(annictId, { at: now.toISOString(), active })
  saveLocal(unseen)
  return unseen
}

export function syncUnseen(conn: GithubConnection): Promise<Unseen> {
  return syncJson(conn, {
    path: PATH,
    parse: parseUnseen,
    merge: mergeUnseen,
    same: sameUnseen,
    serialize: serializeUnseen,
    loadLocal: loadLocalUnseen,
    saveLocal,
    message: (merged) => `見てないの記録を更新（${merged.size}件）`,
  })
}
