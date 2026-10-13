import { useSyncExternalStore } from 'react'
import type { ProgramSlot } from './annict'
import type { GithubConnection } from './github'
import { syncJson } from './syncStore'
import { readStoredBroadcast, saveStoredBroadcast } from './storage'

// 見るサービスと、見てる作品の次の放送（Issue #32。2026-10-13）。
// 放送予定は Annict の公開の API（作品の programs）にある。チャンネルごと・毎週の分が入っていて、配信（動画サービス・ABEMA）と
// 地上波（地域ごと）・BS・CS に分かれる。Annict の「放送予定」の機能（viewer.programs）は Annict のサイトでチャンネルを登録した人にしか出ないので使わず、
// 見るサービスは Anipair の中で選んでもらう（Annict のサイトを挟まない）。放送予定は Annict の利用者が登録した情報なので、画面にそう添える

// 配信サービス。名前は画面に出すもの、channels は Annict のチャンネルの名前（2026-10-13 に今期と前期の人気の作品で確かめた）。
// 並びは配信サービスの検索（vodSearch.ts）と同じで、そのあとに残り
export const SERVICES = [
  { id: 'netflix', label: 'Netflix', channels: ['Netflix'] },
  { id: 'unext', label: 'U-NEXT', channels: ['U-NEXT'] },
  { id: 'prime', label: 'Prime Video', channels: ['Amazon プライム・ビデオ'] },
  { id: 'abema', label: 'ABEMA', channels: ['ABEMAビデオ', 'ABEMA アニメ'] },
  { id: 'danime', label: 'dアニメストア', channels: ['dアニメストア'] },
  { id: 'nico', label: 'ニコニコ', channels: ['ニコニコチャンネル', 'ニコニコ生放送', 'dアニメストア ニコニコ支店'] },
  { id: 'hulu', label: 'Hulu', channels: ['Hulu'] },
  { id: 'fod', label: 'FOD', channels: ['FOD'] },
  { id: 'dmm', label: 'DMM TV', channels: ['DMM TV'] },
  { id: 'disney', label: 'Disney+', channels: ['Disney+'] },
  { id: 'bandai', label: 'バンダイチャンネル', channels: ['バンダイチャンネル'] },
  { id: 'youtube', label: 'YouTube', channels: ['YouTube'] },
] as const

export type ServiceId = (typeof SERVICES)[number]['id']

// 地上波は地域で局が違うので、地域で選ぶ（Annict のチャンネルのまとまり「テレビ 関東」など）
export const REGIONS = ['北海道', '東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州', '沖縄'] as const
export type Region = (typeof REGIONS)[number]

export const SATELLITES = [
  { id: 'bs', label: 'BS' },
  { id: 'cs', label: 'CS（AT-X・アニマックスなど）' },
] as const
export type SatelliteId = (typeof SATELLITES)[number]['id']

// 人ごとの設定（GitHub と連携していれば broadcast.json で端末のあいだで共有する。at は選んだ時刻で、新しい方を採る）
export interface BroadcastPrefs {
  services: ServiceId[]
  region: Region | null
  satellites: SatelliteId[]
  at: string | null
}

export const EMPTY_PREFS: BroadcastPrefs = { services: [], region: null, satellites: [], at: null }

// 選んでいるもの（選んだ時刻を除く）
export type BroadcastChoice = Omit<BroadcastPrefs, 'at'>

export function parseBroadcastPrefs(value: unknown): BroadcastPrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_PREFS
  const v = value as Record<string, unknown>
  const pick = <T extends string>(list: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(list) ? allowed.filter((id) => list.includes(id)) : []
  return {
    services: pick(v.services, SERVICES.map((s) => s.id)),
    region: typeof v.region === 'string' && (REGIONS as readonly string[]).includes(v.region) ? (v.region as Region) : null,
    satellites: pick(v.satellites, SATELLITES.map((s) => s.id)),
    at: typeof v.at === 'string' && Number.isFinite(Date.parse(v.at)) ? v.at : null,
  }
}

export function hasChoice(p: BroadcastChoice): boolean {
  return p.services.length > 0 || p.region !== null || p.satellites.length > 0
}

// 選んでいるものを短く（「Netflix・dアニメストア・地上波（関東）」）。多ければ数だけ
export function choiceSummary(p: BroadcastChoice): string {
  const names = [
    ...SERVICES.filter((s) => p.services.includes(s.id)).map((s) => s.label),
    ...(p.region ? [`地上波（${p.region}）`] : []),
    ...SATELLITES.filter((s) => p.satellites.includes(s.id)).map((s) => s.id.toUpperCase()),
  ]
  if (names.length === 0) return '選んでいません'
  return names.length <= 3 ? names.join('・') : `${names.slice(0, 2).join('・')}ほか${names.length - 2}つ`
}

// ── 選んだサービスを、設定と記録の画面で同じものにする ──
let current: BroadcastPrefs | null = null
const listeners = new Set<() => void>()

function snapshot(): BroadcastPrefs {
  current ??= parseBroadcastPrefs(readStoredBroadcast())
  return current
}

function store(next: BroadcastPrefs): void {
  current = next
  saveStoredBroadcast(next)
  listeners.forEach((l) => l())
}

// 選び直した（選んだ時刻を付けて保存する）
export function setBroadcastPrefs(next: BroadcastChoice, now: Date = new Date()): void {
  store({ ...next, at: now.toISOString() })
}

// ── GitHub との同期（見たいの印とメモと同じ仕組み。lib/syncStore.ts） ──
const later = (a: BroadcastPrefs, b: BroadcastPrefs) => (b.at && (!a.at || Date.parse(b.at) > Date.parse(a.at)) ? b : a)
const sameChoice = (a: BroadcastPrefs, b: BroadcastPrefs) => JSON.stringify(a) === JSON.stringify(b)

export function syncBroadcastPrefs(conn: GithubConnection): Promise<BroadcastPrefs> {
  return syncJson(conn, {
    path: 'broadcast.json',
    parse: parseBroadcastPrefs,
    merge: later,
    same: sameChoice,
    serialize: (p) => ({ version: 1, ...p }),
    loadLocal: snapshot,
    saveLocal: (p) => {
      if (!sameChoice(p, snapshot())) store(p)
    },
    message: () => '見るサービスを更新',
  })
}

export function useBroadcastPrefs(): BroadcastPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    snapshot,
    () => EMPTY_PREFS,
  )
}

// テスト用
export function resetBroadcastPrefs(): void {
  current = null
}

// ── 次の放送 ──
// 放送予定の1件（Annict の Program を短くしたもの。lib/annict.ts）。at は ISO の日時、ch はチャンネルの名前、g はチャンネルのまとまり
export type Slot = ProgramSlot

export function matches(slot: Slot, p: BroadcastChoice): boolean {
  if (p.region && slot.g === `テレビ ${p.region}`) return true
  if (p.satellites.includes('bs') && slot.g.startsWith('BS')) return true
  if (p.satellites.includes('cs') && slot.g === 'スカパー') return true
  return SERVICES.some((s) => p.services.includes(s.id) && (s.channels as readonly string[]).includes(slot.ch))
}

export interface NextBroadcast {
  at: Date
  // 画面に出す名前（配信サービスは選んだときの名前。地上波・BS・CS は局の名前）
  channel: string
  // 同じ時刻に、選んだほかのチャンネルでも始まる
  more: boolean
}

function labelOf(slot: Slot): string {
  return SERVICES.find((s) => (s.channels as readonly string[]).includes(slot.ch))?.label ?? slot.ch.trim()
}

// 選んだチャンネルの中で、いまより後に始まる一番早い放送
export function nextBroadcast(slots: readonly Slot[], p: BroadcastChoice, now: Date): NextBroadcast | null {
  let best: { at: number; labels: Set<string> } | null = null
  for (const slot of slots) {
    const at = Date.parse(slot.at)
    if (!Number.isFinite(at) || at <= now.getTime() || !matches(slot, p)) continue
    if (!best || at < best.at) best = { at, labels: new Set([labelOf(slot)]) }
    else if (at === best.at) best.labels.add(labelOf(slot))
  }
  if (!best) return null
  const [channel] = best.labels
  return { at: new Date(best.at), channel, more: best.labels.size > 1 }
}

// 選んだチャンネルごとの、次の放送（早い順）。配信サービスは選んだときの名前でまとめる（ABEMA の2つのチャンネルなど）
export function upcomingByChannel(slots: readonly Slot[], p: BroadcastChoice, now: Date): { channel: string; at: Date }[] {
  const first = new Map<string, number>()
  for (const slot of slots) {
    const at = Date.parse(slot.at)
    if (!Number.isFinite(at) || at <= now.getTime() || !matches(slot, p)) continue
    const label = labelOf(slot)
    const cur = first.get(label)
    if (cur === undefined || at < cur) first.set(label, at)
  }
  return [...first].sort((a, b) => a[1] - b[1]).map(([channel, at]) => ({ channel, at: new Date(at) }))
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// 日本の時刻で「今日 23:30」「明日 0:00」「10/18(土) 0:00」
export function formatBroadcast(at: Date, now: Date): string {
  const jst = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000)
  const a = jst(at)
  const n = jst(now)
  const day = (d: Date) => Math.floor(d.getTime() / 86400000)
  const time = `${a.getUTCHours()}:${String(a.getUTCMinutes()).padStart(2, '0')}`
  const diff = day(a) - day(n)
  if (diff === 0) return `今日 ${time}`
  if (diff === 1) return `明日 ${time}`
  return `${a.getUTCMonth() + 1}/${a.getUTCDate()}(${WEEKDAYS[a.getUTCDay()]}) ${time}`
}

export function broadcastLabel(next: NextBroadcast, now: Date): string {
  return `次の放送 ${formatBroadcast(next.at, now)} ${next.channel}${next.more ? 'ほか' : ''}`
}
