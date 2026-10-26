import type { GithubConnection } from '../../lib/github'
import { t } from '../../lib/i18n'
import { loadTiersRaw, saveTiersRaw } from '../../lib/storage'
import { syncJson } from '../../lib/syncStore'
import { mergeTierStores, parseTierStore, sameTierStores, serializeTierStore, type TierStore, type TierTable } from './tierList'

// Tier表は端末に控えを持ち、GitHub につないでいれば、そのリポジトリの tiers.json と同期する（wannaNoteStore.ts と同じ仕組み）

const PATH = 'tiers.json'

export function loadLocalTiers(): TierStore {
  return parseTierStore(loadTiersRaw())
}

function saveLocal(store: TierStore): void {
  saveTiersRaw(serializeTierStore(store))
}

// 表を足す・変える（同じ ID なら置き換える）
export function saveTable(table: TierTable): TierStore {
  const store = loadLocalTiers()
  const i = store.tables.findIndex((x) => x.id === table.id)
  const tables = i < 0 ? [...store.tables, table] : store.tables.map((x, j) => (j === i ? table : x))
  const next = { tables, removed: store.removed.filter((r) => r.id !== table.id) }
  saveLocal(next)
  return next
}

export function removeTable(id: string, now: Date = new Date()): TierStore {
  const store = loadLocalTiers()
  const next = { tables: store.tables.filter((x) => x.id !== id), removed: [...store.removed.filter((r) => r.id !== id), { id, at: now.toISOString() }] }
  saveLocal(next)
  return next
}

// 表の ID（端末の中と GitHub で表を見分けるだけ。共有のリンクの ID とは別）
export function newTableId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function syncTiers(conn: GithubConnection): Promise<TierStore> {
  return syncJson(conn, {
    path: PATH,
    parse: parseTierStore,
    merge: mergeTierStores,
    same: sameTierStores,
    serialize: serializeTierStore,
    loadLocal: loadLocalTiers,
    saveLocal,
    message: (merged) => t(`Tier表を更新（${merged.tables.length}つ）`, `Update tier lists (${merged.tables.length})`),
  })
}
