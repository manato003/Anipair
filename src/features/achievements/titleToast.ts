import { useSyncExternalStore } from 'react'
import { loadTitlesState, rememberEarned } from './achievementStore'
import type { Rarity } from './titles'

// 称号を手に入れたときの右上の知らせ（XMB のトロフィーの知らせ）。
// 初めての「覚醒」の前は出さない（実績を初めて開いたときの演出で、まとめて見せる）。
// 手に入れた称号の控え（earned）が無い端末（控えを付ける前から使っている）は、知らせずに控えだけ付ける（前から持っていた称号を、いま手に入れたように出さない）

export interface TitleToast {
  key: number
  name: string
  rarity: Rarity
  // 同時に手に入れた、ほかの称号の数
  more: number
}

let current: TitleToast | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function announceEarned(titles: readonly { id: string; name: string; rarity: Rarity }[]): void {
  if (titles.length === 0) return
  const state = loadTitlesState()
  if (!state.awakened) return
  const known = state.earned
  const fresh = known ? titles.filter((t) => !known.includes(t.id)) : []
  rememberEarned(titles.map((t) => t.id))
  if (fresh.length === 0) return
  seq += 1
  current = { key: seq, name: fresh[0].name, rarity: fresh[0].rarity, more: fresh.length - 1 }
  emit()
}

// God モード（preview と開発のビルドだけ）: 保存せずに知らせだけを出す
export function previewTitleToast(name: string, rarity: Rarity, more = 0): void {
  seq += 1
  current = { key: seq, name, rarity, more }
  emit()
}

export function dismissTitleToast(key: number): void {
  if (current?.key !== key) return
  current = null
  emit()
}

export function useTitleToast(): TitleToast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => null,
  )
}

// テスト用
export function resetTitleToast(): void {
  current = null
  emit()
}
