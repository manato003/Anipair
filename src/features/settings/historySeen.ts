import { useSyncExternalStore } from 'react'
import { loadHistorySeen, saveHistorySeen } from '../../lib/storage'

// 「開発記録」の新着の点。最後に開いたときの版が今の版と違えば、設定の入口・「最新情報」・「開発記録」に点を付ける。
// 今の版は package.json の version（CHANGELOG の先頭の版と同じ。CHANGELOG は開発記録を開くまで読まない）
const listeners = new Set<() => void>()

const unseen = () => loadHistorySeen() !== __APP_VERSION__

export function markHistorySeen(): void {
  if (!unseen()) return
  saveHistorySeen(__APP_VERSION__)
  for (const l of listeners) l()
}

export function useHistoryUnseen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    unseen,
    () => false,
  )
}
