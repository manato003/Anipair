import { useSyncExternalStore } from 'react'
import { loadTipsSeen, saveTipsSeen } from './storage'

// 押した結果が画面に出ない操作（Annict に書き込む・この端末だけに置く）を、初めて押したときに一度だけ画面の下で知らせる。
// 説明の文を画面に置いたままにしない代わり。出したものは端末に覚え、二度と出さない。
// 出すのは components/TipToast.tsx
export type TipId = 'wannaToAnnict' | 'passOnDevice' | 'wannaNote' | 'tierNotRating'

export interface Tip {
  key: number
  text: string
}

let current: Tip | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// まだ出していなければ出す。text は呼ぶときに訳したもの
export function tellOnce(id: TipId, text: string): void {
  const seen = loadTipsSeen()
  if (seen.includes(id)) return
  saveTipsSeen([...seen, id])
  seq += 1
  current = { key: seq, text }
  emit()
}

export function dismissTip(key: number): void {
  if (current?.key !== key) return
  current = null
  emit()
}

export function useTip(): Tip | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => current,
  )
}

// テスト用
export function resetTip(): void {
  current = null
  emit()
}
