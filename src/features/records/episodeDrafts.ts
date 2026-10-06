import { loadEpisodeDraftsRaw, saveEpisodeDraftsRaw } from '../../lib/storage'

// 書いている途中の話の感想（話の ID → 本文）。シートを閉じても消えないように端末に置く。保存したら消す。古いものから捨てて30件まで
const MAX = 30

function load(): [string, string][] {
  const raw = loadEpisodeDraftsRaw()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string')
}

export function loadEpisodeDraft(episodeId: string): string {
  return load().find(([id]) => id === episodeId)?.[1] ?? ''
}

export function saveEpisodeDraft(episodeId: string, text: string): void {
  const rest = load().filter(([id]) => id !== episodeId)
  const next = text.trim() ? [...rest, [episodeId, text] as [string, string]].slice(-MAX) : rest
  saveEpisodeDraftsRaw(next.length > 0 ? Object.fromEntries(next) : null)
}

export function clearEpisodeDraft(episodeId: string): void {
  saveEpisodeDraft(episodeId, '')
}
