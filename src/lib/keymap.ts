import { useSyncExternalStore } from 'react'
import { loadKeymapRaw, loadKeysOnRaw, saveKeymapRaw, saveKeysOn } from './storage'
import { t, tx, type Text } from './i18n'

// PC のキーボード操作の割り当て。評価画面とマッチングで共通

export type KeyAction = 'rateBad' | 'rateAverage' | 'rateGood' | 'rateGreat' | 'skip' | 'wanna' | 'watched' | 'pass' | 'later' | 'undo' | 'detail' | 'watching' | 'stop'

export type Keymap = Record<KeyAction, string>

type Screen = 'rate' | 'match'
const BOTH: readonly Screen[] = ['rate', 'match']

// screens: その操作を使う画面。同じ画面で使う操作どうしは別のキーにする。使う画面が重ならなければ、同じキーにできる
// （評価の「見てない」とマッチングの「興味なし」は、どちらも画面の右下の「いらない」の答えなので、同じキーにしている）
type KeyActionInfo = { action: KeyAction; label: string; where: string; screens: readonly Screen[] }
const WHERE_BOTH: Text = { ja: '評価・マッチング', en: 'Rate / Match' }
const WHERE_RATE: Text = { ja: '評価', en: 'Rate' }
const WHERE_MATCH: Text = { ja: 'マッチング', en: 'Match' }
// label と where は、取り出したときの言語で返す（形は変えない。ファイルの外側で t() を呼ばないため）
function entry(action: KeyAction, label: Text, where: Text, screens: readonly Screen[]): KeyActionInfo {
  return {
    action,
    get label() {
      return tx(label)
    },
    get where() {
      return tx(where)
    },
    screens,
  }
}
export const KEY_ACTIONS: readonly KeyActionInfo[] = [
  entry('rateBad', { ja: '良くない', en: 'Bad' }, WHERE_BOTH, BOTH),
  entry('rateAverage', { ja: '普通', en: 'Okay' }, WHERE_BOTH, BOTH),
  entry('rateGood', { ja: '良い', en: 'Good' }, WHERE_BOTH, BOTH),
  entry('rateGreat', { ja: 'とても良い', en: 'Great' }, WHERE_BOTH, BOTH),
  entry('skip', { ja: '見てない', en: 'Haven’t seen' }, WHERE_RATE, ['rate']),
  entry('wanna', { ja: '見たい', en: 'Want to watch' }, WHERE_BOTH, BOTH),
  entry('watched', { ja: '覚えてない（評価なしで見た）', en: 'Don’t remember (watched, no rating)' }, WHERE_BOTH, BOTH),
  entry('pass', { ja: '興味なし', en: 'Not interested' }, WHERE_MATCH, ['match']),
  entry('later', { ja: '保留', en: 'Later' }, WHERE_MATCH, ['match']),
  entry('undo', { ja: 'ひとつ戻る', en: 'Undo' }, WHERE_BOTH, BOTH),
  entry('detail', { ja: '詳しく見る', en: 'See details' }, WHERE_BOTH, BOTH),
  // 未記録の作品は「見てる」にする。見てる作品のカードでは「まだ見てる」（次へ進むだけ）
  entry('watching', { ja: '見てる', en: 'Watching' }, WHERE_BOTH, BOTH),
  entry('stop', { ja: '視聴中断', en: 'Dropped' }, WHERE_BOTH, BOTH),
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
  return consecutive ? t(`${keys[0]}〜${keys[keys.length - 1]}`, `${keys[0]}–${keys[keys.length - 1]}`) : keys.map(keyLabel).join('')
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

// キー操作を使うか（端末ごと）。既定は使わない: ほとんどの人はクリックで答えるので、ボタンにキーを出さずにすっきりさせる。
// 保存が無くても、前にキーの割り当てを変えた端末は、キーで使っている人なので使う方から始める
let keysOn: boolean | null = null

export function parseKeysOn(value: unknown, customized: boolean): boolean {
  return typeof value === 'boolean' ? value : customized
}

export function getKeysOn(): boolean {
  keysOn ??= parseKeysOn(loadKeysOnRaw(), loadKeymapRaw() !== null)
  return keysOn
}

export function setKeysOn(on: boolean): void {
  keysOn = on
  saveKeysOn(on)
  for (const l of listeners) l()
}

export function useKeysOn(): boolean {
  return useSyncExternalStore(subscribe, getKeysOn)
}

// テストのあいだで覚えた値を捨てる
export function resetKeymapForTests(): void {
  current = null
  keysOn = null
}
