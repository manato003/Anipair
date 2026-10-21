import { loadCacheRaw, saveCacheRaw, type CacheName } from './storage'

// 端末に残す、だれのものでもない作り直せる控えの表（公式の英題・人の英語名・Wikipedia のあらすじ）。
// 読み書きは storage.ts を通す（保存容量があふれたら最初に捨てる控えに入れ、「消して再読み込み」でも消える。古いページからは書かない）。
// 新しく入れた・入れ直した順に max 件まで残す。書き込みは1秒まとめる（続けて覚えるたびに全体を書かない）
export interface PersistedMap<V> {
  get(key: string): V | undefined
  has(key: string): boolean
  set(key: string, value: V): void
  // テスト用: 読み込みをやり直さず、渡した中身から始める
  reset(seed?: Record<string, V>): void
}

export function persistedMap<V>(name: CacheName, max: number, parse: (value: unknown) => V | null): PersistedMap<V> {
  let map: Map<string, V> | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  const load = (): Map<string, V> => {
    if (map) return map
    map = new Map()
    const raw = loadCacheRaw(name)
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const v = parse(value)
        if (v !== null) map.set(key, v)
      }
    }
    return map
  }
  const save = () => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      saveCacheRaw(name, Object.fromEntries([...load()].slice(-max)))
    }, 1000)
  }
  return {
    get: (key) => load().get(key),
    has: (key) => load().has(key),
    set(key, value) {
      const m = load()
      m.delete(key)
      m.set(key, value)
      save()
    },
    reset(seed = {}) {
      map = new Map(Object.entries(seed))
    },
  }
}
