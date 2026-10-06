import type { GithubConnection } from '../../lib/github'
import { loadWannaNotesRaw, saveWannaNotesRaw } from '../../lib/storage'
import { syncJson } from '../../lib/syncStore'
import { MEMO_MAX, mergeWannaNotes, parseWannaNotes, sameWannaNotes, serializeWannaNotes, type WannaNotes } from './wannaNotes'

// 見たいの印とメモは端末に控えを持ち、GitHub につないでいれば、そのリポジトリの wanna-notes.json と同期する（unseenStore.ts と同じ仕組み）

const PATH = 'wanna-notes.json'

function saveLocal(notes: WannaNotes): void {
  saveWannaNotesRaw(serializeWannaNotes(notes))
}

export function loadLocalWannaNotes(): WannaNotes {
  return parseWannaNotes(loadWannaNotesRaw())
}

export function setWannaNote(annictId: number, value: { priority: boolean; memo: string }, now: Date = new Date()): WannaNotes {
  const notes = loadLocalWannaNotes()
  notes.set(annictId, { at: now.toISOString(), priority: value.priority, memo: value.memo.trim().slice(0, MEMO_MAX) })
  saveLocal(notes)
  return notes
}

export function syncWannaNotes(conn: GithubConnection): Promise<WannaNotes> {
  return syncJson(conn, {
    path: PATH,
    parse: parseWannaNotes,
    merge: mergeWannaNotes,
    same: sameWannaNotes,
    serialize: serializeWannaNotes,
    loadLocal: loadLocalWannaNotes,
    saveLocal,
    message: (merged) => `見たいの印とメモを更新（${merged.size}件）`,
  })
}
