import { useSyncExternalStore } from 'react'
import { loadKeymapRaw, saveKeymapRaw } from './storage'

// PC のキーボード操作の割り当て。評価画面とマッチングで共通

export type KeyAction = 'rateBad' | 'rateAverage' | 'rateGood' | 'rateGreat' | 'skip' | 'wanna' | 'watched' | 'pass' | 'later' | 'undo' | 'detail' | 'watching' | 'stop'

export type Keymap = Record<KeyAction, string>

export const KEY_ACTIONS: readonly { action: KeyAction; label: string; where: string }[] = [
  { action: 'rateBad', label: '良くない', where: '評価・マッチング' },
  { action: 'rateAverage', label: '普通', where: '評価・マッチング' },
  { action: 'rateGood', label: '良い', where: '評価・マッチング' },
  { action: 'rateGreat', label: 'とても良い', where: '評価・マッチング' },
  { action: 'skip', label: '見てない', where: '評価' },
  { action: 'wanna', label: '見たい', where: '評価・マッチング' },
  { action: 'watched', label: '覚えてない（評価なしで見た）', where: '評価・マッチング' },
  { action: 'pass', label: 'パス', where: 'マッチング' },
  { action: 'later', label: 'スルー', where: 'マッチング' },
  { action: 'undo', label: 'ひとつ戻る', where: '評価・マッチング' },
  { action: 'detail', label: '詳しく見る', where: '評価・マッチング' },
  // 未記録の作品は「見てる」にする。見てる作品のカードでは「まだ見てる」（次へ進むだけ）
  { action: 'watching', label: '見てる', where: '評価・マッチング' },
  { action: 'stop', label: '視聴中断', where: '評価・マッチング' },
]

export const DEFAULT_KEYMAP: Keymap = {
  rateBad: '1',
  rateAverage: '2',
  rateGood: '3',
  rateGreat: '4',
  skip: '0',
  wanna: 'w',
  watched: 'f',
  pass: 'p',
  later: 's',
  undo: 'z',
  detail: 'i',
  watching: 'e',
  stop: 'x',
}

// 割り当てられる名前付きのキー。Enter と Space はフォーカス中のボタンも押してしまうので使わない
const NAMED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace'] as const

// キー入力を割り当ての形にそろえる。割り当てられないキーは null
export function normalizeKey(key: string): string | null {
  if ((NAMED_KEYS as readonly string[]).includes(key)) return key
  if (key.length !== 1 || key === ' ') return null
  return key.toLowerCase()
}

const LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Backspace: 'BS',
}

export function keyLabel(key: string): string {
  return LABELS[key] ?? key.toUpperCase()
}

// 評価の4キーを「1〜4」のように縮めて見せる。連番でなければ並べる
export function rangeLabel(keys: string[]): string {
  const digits = keys.map(Number)
  const consecutive = keys.every((k) => /^\d$/.test(k)) && digits.every((d, i) => i === 0 || d === digits[i - 1] + 1)
  return consecutive ? `${keys[0]}〜${keys[keys.length - 1]}` : keys.map(keyLabel).join('')
}

// 空いているキーを探す順番
const SPARE_KEYS = 'sqertyuiopadghjklxcvbnm56789'.split('')

// 保存された割り当てを読む。
// - 保存に無い操作（あとから足した操作）は既定のキーを当て、既定がほかの操作に使われていれば空いているキーを当てる
// - 保存された値どうしが重複している・壊れている場合は既定に戻す（重複すると一方の操作が押せなくなるため）
export function parseKeymap(value: unknown): Keymap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_KEYMAP }
  const stored: Partial<Keymap> = {}
  for (const { action } of KEY_ACTIONS) {
    const k = (value as Record<string, unknown>)[action]
    if (typeof k === 'string' && normalizeKey(k) === k) stored[action] = k
  }
  const storedKeys = Object.values(stored)
  if (new Set(storedKeys).size !== storedKeys.length) return { ...DEFAULT_KEYMAP }
  const used = new Set(storedKeys)
  const out: Partial<Keymap> = { ...stored }
  // 1段目: 既定のキーが空いていれば、それを当てる
  for (const { action } of KEY_ACTIONS) {
    if (out[action] || used.has(DEFAULT_KEYMAP[action])) continue
    out[action] = DEFAULT_KEYMAP[action]
    used.add(DEFAULT_KEYMAP[action])
  }
  // 2段目: 既定のキーが埋まっていた操作に、空いているキーを当てる
  for (const { action } of KEY_ACTIONS) {
    if (out[action]) continue
    const k = SPARE_KEYS.find((c) => !used.has(c))
    if (!k) return { ...DEFAULT_KEYMAP }
    out[action] = k
    used.add(k)
  }
  return out as Keymap
}

// 別の操作が使っているキーを選んだら、2つの操作のキーを入れ替える
export function assignKey(map: Keymap, action: KeyAction, key: string): Keymap {
  const next = { ...map }
  const holder = (Object.keys(map) as KeyAction[]).find((a) => a !== action && map[a] === key)
  if (holder) next[holder] = map[action]
  next[action] = key
  return next
}

export function actionForKey(map: Keymap, key: string): KeyAction | null {
  const k = normalizeKey(key)
  if (!k) return null
  return (Object.keys(map) as KeyAction[]).find((a) => map[a] === k) ?? null
}

// 設定画面での変更を、開いている画面に即座に反映する
let current: Keymap | null = null
const listeners = new Set<() => void>()

export function getKeymap(): Keymap {
  current ??= parseKeymap(loadKeymapRaw())
  return current
}

export function setKeymap(map: Keymap): void {
  current = map
  saveKeymapRaw(map)
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useKeymap(): Keymap {
  return useSyncExternalStore(subscribe, getKeymap)
}
