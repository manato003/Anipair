import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, actionsForKey, assignKey, clash, hadReservedKeys, keyLabel, normalizeKey, parseKeymap, rangeLabel, type KeyAction, type Keymap } from './keymap'

describe('normalizeKey', () => {
  it.each([
    ['W', 'w'],
    ['w', 'w'],
    ['7', '7'],
    [';', ';'],
    ['ArrowUp', 'ArrowUp'],
    ['Backspace', 'Backspace'],
  ])('%s → %s', (key, want) => {
    expect(normalizeKey(key)).toBe(want)
  })

  // ← → は分類の切り替えに使う
  it.each([' ', 'Enter', 'Escape', 'Tab', 'Shift', 'F5', '', 'ArrowLeft', 'ArrowRight'])('refuses %j', (key) => {
    expect(normalizeKey(key)).toBeNull()
  })
})

// 同じ画面で使う操作どうしが、同じキーになっていないか
function noClash(m: Keymap): boolean {
  const actions = Object.keys(m) as KeyAction[]
  return actions.every((a) => actions.every((b) => m[a] !== m[b] || !clash(a, b)))
}

describe('DEFAULT_KEYMAP', () => {
  it('keeps every key within reach of the left hand, and shares F between "not watched" (rate) and "not interested" (match)', () => {
    expect(Object.values(DEFAULT_KEYMAP).every((k) => '1234qwerasdfz'.includes(k))).toBe(true)
    expect(DEFAULT_KEYMAP.skip).toBe('f')
    expect(DEFAULT_KEYMAP.pass).toBe('f')
    expect(noClash(DEFAULT_KEYMAP)).toBe(true)
  })
})

describe('parseKeymap', () => {
  it('fills missing and invalid entries from the defaults', () => {
    const m = parseKeymap({ wanna: 'g', pass: 'Enter', undo: 'ZZ', rateBad: 'ArrowUp' })
    expect(m).toEqual({ ...DEFAULT_KEYMAP, wanna: 'g', rateBad: 'ArrowUp' })
  })

  it('moves an action saved on ← or → (now used to switch screens) to its default key, and tells that it did', () => {
    const saved = { ...DEFAULT_KEYMAP, rateGood: 'ArrowRight', stop: 'ArrowLeft' }
    expect(hadReservedKeys(saved)).toBe(true)
    expect(hadReservedKeys(DEFAULT_KEYMAP)).toBe(false)
    expect(parseKeymap(saved)).toEqual(DEFAULT_KEYMAP)
  })

  it('falls back to the defaults when two actions of the same screen share a key, but allows it across screens', () => {
    expect(parseKeymap({ wanna: 'p', pass: 'p' })).toEqual(DEFAULT_KEYMAP)
    // 見てない（評価）と保留（マッチング）は画面が違うので、同じキーでよい
    expect(parseKeymap({ ...DEFAULT_KEYMAP, skip: 'd' })).toEqual({ ...DEFAULT_KEYMAP, skip: 'd' })
  })

  it('keeps an older saved map (before the left-hand defaults) as it was', () => {
    const old = { rateBad: '1', rateAverage: '2', rateGood: '3', rateGreat: '4', skip: '0', wanna: 'w', watched: 'f', pass: 'p', later: 's', undo: 'z', detail: 'i', watching: 'e', stop: 'x' }
    expect(parseKeymap(old)).toEqual(old)
  })

  it('gives an action missing from the saved map its default key, or a free one if that is taken in the same screen', () => {
    const saved = { ...DEFAULT_KEYMAP, wanna: 'd' } as Record<string, string>
    delete saved.later
    const m = parseKeymap(saved)
    expect(m.wanna).toBe('d')
    // 保留の既定 D は、マッチングでも使う「見たい」が持っているので、空いているキー（左手の届く所から）
    expect(m.later).toBe('a')
    expect(noClash(m)).toBe(true)
  })

  it.each([null, 'x', [], 5])('treats %j as the defaults', (v) => {
    expect(parseKeymap(v)).toEqual(DEFAULT_KEYMAP)
  })
})

describe('assignKey', () => {
  it('assigns a free key without touching others', () => {
    const m = assignKey(DEFAULT_KEYMAP, 'wanna', 'g')
    expect(m.wanna).toBe('g')
    expect({ ...m, wanna: DEFAULT_KEYMAP.wanna }).toEqual(DEFAULT_KEYMAP)
  })

  it('swaps with the actions of the same screen that had the key, and leaves the other screen alone', () => {
    // 保留（マッチング）に F: 興味なし（マッチング）と入れ替わる。見てない（評価）は F のまま
    const m = assignKey(DEFAULT_KEYMAP, 'later', 'f')
    expect(m.later).toBe('f')
    expect(m.pass).toBe('d')
    expect(m.skip).toBe('f')
    // 見たい（両方）に F: 見てない・興味なしの両方が、見たいの前のキーに移る
    const n = assignKey(DEFAULT_KEYMAP, 'wanna', 'f')
    expect(n.wanna).toBe('f')
    expect(n.skip).toBe('w')
    expect(n.pass).toBe('w')
    expect(noClash(n)).toBe(true)
  })

  it('never lets two actions of the same screen share a key after any sequence of assignments', () => {
    let m = DEFAULT_KEYMAP
    const moves: [KeyAction, string][] = [['undo', '1'], ['rateBad', 'w'], ['wanna', 'z'], ['pass', 'ArrowUp'], ['skip', 'ArrowUp'], ['later', 'f'], ['detail', 'f']]
    for (const [a, k] of moves) {
      m = assignKey(m, a, k)
      expect(noClash(m)).toBe(true)
    }
    expect(m.detail).toBe('f')
  })
})

describe('actionsForKey', () => {
  it('finds the actions regardless of letter case (two when the screens differ), and nothing for unbound keys', () => {
    expect(actionsForKey(DEFAULT_KEYMAP, 'W')).toEqual(['wanna'])
    expect(actionsForKey(DEFAULT_KEYMAP, '3')).toEqual(['rateGood'])
    expect(actionsForKey(DEFAULT_KEYMAP, 'F').sort()).toEqual(['pass', 'skip'])
    expect(actionsForKey(DEFAULT_KEYMAP, 'y')).toEqual([])
    expect(actionsForKey(DEFAULT_KEYMAP, 'Enter')).toEqual([])
  })
})

describe('labels', () => {
  it('shows letters in upper case and arrows as symbols', () => {
    expect(keyLabel('w')).toBe('W')
    expect(keyLabel('ArrowRight')).toBe('→')
  })

  it('shortens consecutive digits to a range and lists anything else', () => {
    expect(rangeLabel(['1', '2', '3', '4'])).toBe('1〜4')
    expect(rangeLabel(['1', '3', '2', '4'])).toBe('1324')
    expect(rangeLabel(['a', 's', 'd', 'f'])).toBe('ASDF')
  })
})
