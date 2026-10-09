import { useSyncExternalStore } from 'react'
import { loadKeymapRaw, saveKeymapRaw } from './storage'

// PC のキーボード操作の割り当て。評価画面とマッチングで共通

export type KeyAction = 'rateBad' | 'rateAverage' | 'rateGood' | 'rateGreat' | 'skip' | 'wanna' | 'watched' | 'pass' | 'later' | 'undo' | 'detail' | 'watching' | 'stop'

export type Keymap = Record<KeyAction, string>

type Screen = 'rate' | 'match'
const BOTH: readonly Screen[] = ['rate', 'match']

// screens: その操作を使う画面。同じ画面で使う操作どうしは別のキーにする。使う画面が重ならなければ、同じキーにできる
// （評価の「見てない」とマッチングの「興味なし」は、どちらも画面の右下の「いらない」の答えなので、同じキーにしている）
export const KEY_ACTIONS: readonly { action: KeyAction; label: string; where: string; screens: readonly Screen[] }[] = [
  { action: 'rateBad', label: '良くない', where: '評価・マッチング', screens: BOTH },
  { action: 'rateAverage', label: '普通', where: '評価・マッチング', screens: BOTH },
  { action: 'rateGood', label: '良い', where: '評価・マッチング', screens: BOTH },
  { action: 'rateGreat', label: 'とても良い', where: '評価・マッチング', screens: BOTH },
  { action: 'skip', label: '見てない', where: '評価', screens: ['rate'] },
  { action: 'wanna', label: '見たい', where: '評価・マッチング', screens: BOTH },
  { action: 'watched', label: '覚えてない（評価なしで見た）', where: '評価・マッチング', screens: BOTH },
  { action: 'pass', label: '興味なし', where: 'マッチング', screens: ['match'] },
  { action: 'later', label: '保留', where: 'マッチング', screens: ['match'] },
  { action: 'undo', label: 'ひとつ戻る', where: '評価・マッチング', screens: BOTH },
  { action: 'detail', label: '詳しく見る', where: '評価・マッチング', screens: BOTH },
  // 未記録の作品は「見てる」にする。見てる作品のカードでは「まだ見てる」（次へ進むだけ）
  { action: 'watching', label: '見てる', where: '評価・マッチング', screens: BOTH },
  { action: 'stop', label: '視聴中断', where: '評価・マッチング', screens: BOTH },
]

// 2つの操作が同じ画面で使われるか（使われるなら、同じキーにできない）
export function clash(a: KeyAction, b: KeyAction): boolean {
  if (a === b) return false
  const sa = KEY_ACTIONS.find((x) => x.action === a)?.screens ?? BOTH
  const sb = KEY_ACTIONS.find((x) => x.action === b)?.screens ?? BOTH
  return sa.some((s) => sb.includes(s))
}

// 既定の割り当て。右手はマウス、左手はキーボードの左側（A S D F）に置いて使う前提で、手首を動かさずに届く所だけを使う。
// 評価の4段階は数字の 1〜4（左から右へ、良くない → とても良い）。いちばん多く押す「見てない」「興味なし」は人差し指のホームの F
export const DEFAULT_KEYMAP: Keymap = {
  rateBad: '1',
  rateAverage: '2',
  rateGood: '3',
  rateGreat: '4',
  watched: 'q',
  wanna: 'w',
  watching: 'e',
  stop: 'r',
  detail: 's',
  later: 'd',
  skip: 'f',
  pass: 'f',
  undo: 'z',
}

// 割り当てられる名前付きのキー。Enter と Space はフォーカス中のボタンも押してしまうので使わない。
// ← → は分類の切り替えに使うので割り当てない（lib/useArrowNav.ts。前に割り当てていた操作は、読むときに空いているキーへ移す）
const NAMED_KEYS = ['ArrowUp', 'ArrowDown', 'Backspace'] as const
// 分類の切り替えに使うキー
export const RESERVED_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight']

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

// 空いているキーを探す順番（左手の届く所から）
const SPARE_KEYS = 'agxcvtb5yhn6ujm789iklop0'.split('')

// そのキーを、action と同じ画面で使うほかの操作が使っているか
function takenFor(map: Partial<Keymap>, action: KeyAction, key: string): boolean {
  return (Object.keys(map) as KeyAction[]).some((a) => map[a] === key && clash(a, action))
}

// 保存された割り当てを読む。
// - 保存に無い操作（あとから足した操作）は既定のキーを当て、既定が同じ画面のほかの操作に使われていれば空いているキーを当てる
// - 同じ画面で使う操作どうしが同じキーになっている・壊れている場合は既定に戻す（一方の操作が押せなくなるため）
export function parseKeymap(value: unknown): Keymap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_KEYMAP }
  const stored: Partial<Keymap> = {}
  for (const { action } of KEY_ACTIONS) {
    const k = (value as Record<string, unknown>)[action]
    if (typeof k === 'string' && normalizeKey(k) === k) stored[action] = k
  }
  for (const a of Object.keys(stored) as KeyAction[]) {
    if (takenFor(stored, a, stored[a] as string)) return { ...DEFAULT_KEYMAP }
  }
  const out: Partial<Keymap> = { ...stored }
  // 1段目: 既定のキーが空いていれば、それを当てる
  for (const { action } of KEY_ACTIONS) {
    if (out[action] || takenFor(out, action, DEFAULT_KEYMAP[action])) continue
    out[action] = DEFAULT_KEYMAP[action]
  }
  // 2段目: 既定のキーが埋まっていた操作に、空いているキーを当てる
  for (const { action } of KEY_ACTIONS) {
    if (out[action]) continue
    const k = SPARE_KEYS.find((c) => !takenFor(out, action, c))
    if (!k) return { ...DEFAULT_KEYMAP }
    out[action] = k
  }
  return out as Keymap
}

// 同じ画面で使うほかの操作が使っているキーを選んだら、2つの操作のキーを入れ替える
export function assignKey(map: Keymap, action: KeyAction, key: string): Keymap {
  const next = { ...map }
  for (const h of (Object.keys(map) as KeyAction[]).filter((a) => map[a] === key && clash(a, action))) next[h] = map[action]
  next[action] = key
  return next
}

// そのキーの操作（画面が違えば、同じキーに2つある。呼ぶ側が、自分の画面で使う方を選ぶ）
export function actionsForKey(map: Keymap, key: string): KeyAction[] {
  const k = normalizeKey(key)
  if (!k) return []
  return (Object.keys(map) as KeyAction[]).filter((a) => map[a] === k)
}

// 保存された割り当てに、いまは分類の切り替えに使う ← → が入っていたか（入っていた操作は、読むときに別のキーへ移している。設定で知らせる）
export function hadReservedKeys(value: unknown): boolean {
  return !!value && typeof value === 'object' && Object.values(value as Record<string, unknown>).some((k) => typeof k === 'string' && RESERVED_KEYS.includes(k))
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
