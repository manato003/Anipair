import type { GithubConnection } from '../../lib/github'
import { loadPassesRaw, savePassesRaw } from '../../lib/storage'
import { syncJson } from '../../lib/syncStore'
import { mergePasses, parsePasses, samePasses, serializePasses, type HideKind, type Passes } from './passes'

// パスとスルーの記録は端末に控えを持ち、GitHub につないでいれば、そのリポジトリの passes.json と同期する

const PATH = 'passes.json'

export function loadLocalPasses(): Passes {
  return parsePasses(loadPassesRaw())
}

function saveLocal(passes: Passes): void {
  savePassesRaw(serializePasses(passes))
}

export function setPass(malId: number, active: boolean, opts: { kind?: HideKind; now?: Date } = {}): Passes {
  const { kind = 'pass', now = new Date() } = opts
  const passes = loadLocalPasses()
  passes.set(malId, { at: now.toISOString(), active, kind })
  saveLocal(passes)
  return passes
}

// GitHub の内容と端末の控えを合わせ、両方を同じにする
export function syncPasses(conn: GithubConnection): Promise<Passes> {
  return syncJson(conn, {
    path: PATH,
    parse: parsePasses,
    merge: mergePasses,
    same: samePasses,
    serialize: serializePasses,
    loadLocal: loadLocalPasses,
    saveLocal,
    message: (merged) => `パスの記録を更新（${merged.size}件）`,
  })
}
