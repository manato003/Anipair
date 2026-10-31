import type { GithubConnection } from '../../lib/github'
import { t } from '../../lib/i18n'
import { loadDislikesRaw, saveDislikesRaw } from '../../lib/storage'
import { syncJson } from '../../lib/syncStore'
import { activeKeys, mergeDislikes, parseDislikes, sameDislikes, serializeDislikes, type Dislikes } from './dislikes'

// 苦手な項目は端末に控えを持ち、GitHub につないでいれば、そのリポジトリの dislikes.json と同期する

const PATH = 'dislikes.json'

export function loadLocalDislikes(): Dislikes {
  return parseDislikes(loadDislikesRaw())
}

function saveLocal(d: Dislikes): void {
  saveDislikesRaw(serializeDislikes(d))
}

export function setDislike(key: string, active: boolean, opts: { name?: string; now?: Date } = {}): Dislikes {
  const d = loadLocalDislikes()
  const name = opts.name ?? d.get(key)?.name
  d.set(key, { at: (opts.now ?? new Date()).toISOString(), active, ...(name ? { name } : {}) })
  saveLocal(d)
  return d
}

// GitHub の内容と端末の控えを合わせ、両方を同じにする
export function syncDislikes(conn: GithubConnection): Promise<Dislikes> {
  return syncJson(conn, {
    path: PATH,
    parse: parseDislikes,
    merge: mergeDislikes,
    same: sameDislikes,
    serialize: serializeDislikes,
    loadLocal: loadLocalDislikes,
    saveLocal,
    empty: (merged) => merged.size === 0,
    message: (merged) => t(`苦手な項目を更新（${activeKeys(merged).length}件）`, `Update disliked topics (${activeKeys(merged).length})`),
  })
}
