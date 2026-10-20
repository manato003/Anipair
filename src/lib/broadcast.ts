import { useSyncExternalStore } from 'react'
import type { ProgramSlot } from './annict'
import type { GithubConnection } from './github'
import { syncJson } from './syncStore'
import { readStoredBroadcast, saveStoredBroadcast } from './storage'
import { getLang, t, weekdayShort } from './i18n'

// 見るサービスと、見てる作品の次の放送（Issue #32。2026-10-13）。
// 放送予定は Annict の公開の API（作品の programs）にある。チャンネルごと・毎週の分が入っていて、配信（動画サービス・ABEMA）と
// 地上波（地域ごと）・BS・CS に分かれる。Annict の「放送予定」の機能（viewer.programs）は Annict のサイトでチャンネルを登録した人にしか出ないので使わず、
// 見るサービスは Anipair の中で選んでもらう（Annict のサイトを挟まない）。放送予定は Annict の利用者が登録した情報なので、画面にそう添える

// 配信サービス。名前は画面に出すもの、channels は Annict のチャンネルの名前（2026-10-13 に今期と前期の人気の作品で確かめた）。
// 並びは配信サービスの検索（vodSearch.ts）と同じで、そのあとに残り
// label は取り出したときの言語で返す（getter。ファイルの外側で t() を呼ばないため）
export const SERVICES = [
  { id: 'netflix', label: 'Netflix', channels: ['Netflix'] },
  { id: 'unext', label: 'U-NEXT', channels: ['U-NEXT'] },
  { id: 'prime', label: 'Prime Video', channels: ['Amazon プライム・ビデオ'] }, // i18n-ok: channels は Annict のチャンネル名（データ）
  // ABEMA はチャンネルが多い（ABEMA アニメLIVE・ABEMA みんなのアニメなど）ので、Annict のチャンネルのまとまり「ABEMA」で見る（#34）
  { id: 'abema', label: 'ABEMA', channels: ['ABEMAビデオ', 'ABEMA アニメ'], group: 'ABEMA' }, // i18n-ok: channels は Annict のチャンネル名（データ）
  {
    id: 'danime',
    get label() {
      return t('dアニメストア', 'd Anime Store')
    },
    channels: ['dアニメストア'], // i18n-ok: channels は Annict のチャンネル名（データ）
  },
  {
    id: 'nico',
    get label() {
      return t('ニコニコ', 'Niconico')
    },
    channels: ['ニコニコチャンネル', 'ニコニコ生放送', 'dアニメストア ニコニコ支店'], // i18n-ok: channels は Annict のチャンネル名（データ）
  },
  { id: 'hulu', label: 'Hulu', channels: ['Hulu'] },
  { id: 'fod', label: 'FOD', channels: ['FOD'] },
  { id: 'dmm', label: 'DMM TV', channels: ['DMM TV'] },
  { id: 'disney', label: 'Disney+', channels: ['Disney+'] },
  {
    id: 'bandai',
    get label() {
      return t('バンダイチャンネル', 'Bandai Channel')
    },
    channels: ['バンダイチャンネル'], // i18n-ok: channels は Annict のチャンネル名（データ）
  },
  { id: 'youtube', label: 'YouTube', channels: ['YouTube'] },
] as const

export type ServiceId = (typeof SERVICES)[number]['id']

// 地上波は地域で局が違うので、地域で選ぶ（Annict のチャンネルのまとまり「テレビ 関東」など）
export const REGIONS = ['北海道', '東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州', '沖縄'] as const // i18n-ok: 保存する値であり Annict のまとまり「テレビ 関東」などと照合する鍵（表示の英語名は regionLabel）
export type Region = (typeof REGIONS)[number]

// REGIONS と同じ並びの英語名
const REGION_EN = ['Hokkaido', 'Tohoku', 'Kanto', 'Koshinetsu', 'Hokuriku', 'Tokai', 'Kinki', 'Chugoku', 'Shikoku', 'Kyushu', 'Okinawa']

// 地域の表示の名前（保存する値は日本語のまま）
export function regionLabel(region: Region): string {
  return t(region, REGION_EN[REGIONS.indexOf(region)]) // i18n-ok: region は保存する値（日本語の地域名）。日本語の画面ではそのまま出す
}

export const SATELLITES = [
  { id: 'bs', label: 'BS' },
  {
    id: 'cs',
    get label() {
      return t('CS（AT-X・アニマックスなど）', 'CS (AT-X, Animax, etc.)')
    },
  },
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
    ...(p.region ? [t(`地上波（${p.region}）`, `Broadcast TV (${regionLabel(p.region)})`)] : []),
    ...SATELLITES.filter((s) => p.satellites.includes(s.id)).map((s) => s.id.toUpperCase()),
  ]
  if (names.length === 0) return t('選んでいません', 'None selected')
  const sep = t('・', ', ')
  if (names.length <= 3) return names.join(sep)
  const head = names.slice(0, 2).join(sep)
  return t(`${head}ほか${names.length - 2}つ`, `${head} and ${names.length - 2} more`)
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
    message: () => '見るサービスを更新', // i18n-ok: 利用者の GitHub に残るコミットメッセージ（画面には出ない。ほかの同期と同じく日本語）
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

// サービスに当たるか（チャンネルの名前か、まとまり）
function serviceOf(slot: Slot): (typeof SERVICES)[number] | undefined {
  return SERVICES.find((s) => (s.channels as readonly string[]).includes(slot.ch) || ('group' in s && s.group === slot.g))
}

export function matches(slot: Slot, p: BroadcastChoice): boolean {
  // 地域を選んだら、その地域の局と、全国の局（NHK など。Annict のまとまり「テレビ 全国」。#34）
  if (p.region && (slot.g === `テレビ ${p.region}` || slot.g === 'テレビ 全国')) return true // i18n-ok: Annict のチャンネルのまとまりの名前（データ）
  if (p.satellites.includes('bs') && slot.g.startsWith('BS')) return true
  if (p.satellites.includes('cs') && slot.g === 'スカパー') return true // i18n-ok: Annict のチャンネルのまとまりの名前（データ）
  const service = serviceOf(slot)
  return service !== undefined && p.services.includes(service.id)
}

export interface NextBroadcast {
  at: Date
  // 画面に出す名前（配信サービスは選んだときの名前。地上波・BS・CS は局の名前）
  channel: string
  // 同じ時刻に、選んだほかのチャンネルでも始まる
  more: boolean
}

// 同じ時刻に複数あるときに先に出す名前: 配信サービス（選ぶ一覧の順）、そのあと局（地方局より先に配信を出す。2026-10-13 に「とちぎテレビほか」と出た）
function labelRank(label: string): number {
  const i = SERVICES.findIndex((s) => s.label === label)
  return i >= 0 ? i : SERVICES.length
}
const firstLabel = (labels: Iterable<string>): string => [...labels].sort((a, b) => labelRank(a) - labelRank(b))[0]

// 放送局の英語名（英語の画面だけ。鍵は Annict のチャンネル名。2026-10-20 に最近5クールの人気作の放送局を集めて作った）。
// 表に無い局は Annict の名前のまま出す
const CHANNELS_EN: Record<string, string> = {
  'TOKYO MX': 'Tokyo MX', // i18n-ok
  'BS11イレブン': 'BS11', // i18n-ok
  'ABEMAビデオ': 'ABEMA Video', // i18n-ok
  'ABEMA アニメ': 'ABEMA Anime', // i18n-ok
  'MBS毎日放送': 'MBS', // i18n-ok
  'テレビ東京': 'TV Tokyo', // i18n-ok
  'テレビ大阪': 'TV Osaka', // i18n-ok
  'HBC北海道放送': 'HBC', // i18n-ok
  'BS日テレ': 'BS NTV', // i18n-ok
  '群馬テレビ': 'Gunma TV', // i18n-ok
  'サンテレビ': 'Sun TV', // i18n-ok
  'BS朝日': 'BS Asahi', // i18n-ok
  'とちぎテレビ': 'Tochigi TV', // i18n-ok
  'ABCテレビ': 'ABC TV', // i18n-ok
  'HTB北海道テレビ': 'HTB', // i18n-ok
  '関西テレビ': 'Kansai TV', // i18n-ok
  'テレビ愛知': 'TV Aichi', // i18n-ok
  '日本テレビ': 'Nippon TV', // i18n-ok
  'CBC中部日本放送': 'CBC TV', // i18n-ok
  '読売テレビ': 'Yomiuri TV', // i18n-ok
  'ニコニコチャンネル': 'Niconico Channel', // i18n-ok
  'ABA青森朝日放送': 'ABA', // i18n-ok
  'IAT岩手朝日テレビ': 'IAT', // i18n-ok
  'AAB秋田朝日放送': 'AAB', // i18n-ok
  'テレビ北海道': 'TV Hokkaido', // i18n-ok
  'ATV青森テレビ': 'ATV', // i18n-ok
  'IBC岩手放送': 'IBC', // i18n-ok
  'ニコニコ生放送': 'Niconico Live', // i18n-ok
  'KBS京都': 'KBS Kyoto', // i18n-ok
  'テレビ朝日': 'TV Asahi', // i18n-ok
  'TUYテレビユー山形': 'TUY', // i18n-ok
  'dアニメストア ニコニコ支店': 'd Anime Store on Niconico', // i18n-ok
  '岩手めんこいテレビ': 'Iwate Menkoi TV', // i18n-ok
  'フジテレビ': 'Fuji TV', // i18n-ok
  'メ～テレ': 'Nagoya TV', // i18n-ok
  '北海道文化放送': 'UHB', // i18n-ok
  '青森放送': 'RAB', // i18n-ok
  'テレビ岩手': 'TVI', // i18n-ok
  'BSフジ': 'BS Fuji', // i18n-ok
  'TUFテレビユー福島': 'TUF', // i18n-ok
  '仙台放送': 'Sendai Broadcasting', // i18n-ok
  'AKT秋田テレビ': 'AKT', // i18n-ok
  'BSテレ東': 'BS TV Tokyo', // i18n-ok
  'YBC山形放送': 'YBC', // i18n-ok
  'テレビせとうち': 'TV Setouchi', // i18n-ok
  'YTS山形テレビ': 'YTS', // i18n-ok
  'TVQ九州放送': 'TVQ', // i18n-ok
  'RKB毎日放送': 'RKB', // i18n-ok
  'テレ玉': 'TV Saitama', // i18n-ok
  '札幌テレビ放送': 'STV', // i18n-ok
  '中京テレビ': 'Chukyo TV', // i18n-ok
  'NBC長崎放送': 'NBC Nagasaki', // i18n-ok
  'UTYテレビ山梨': 'UTY', // i18n-ok
  'SBC信越放送': 'SBC', // i18n-ok
  'テレビ神奈川 (tvk)': 'tvk', // i18n-ok
  'チバテレビ': 'Chiba TV', // i18n-ok
  'MMTミヤギテレビ': 'MMT', // i18n-ok
  '東海テレビ': 'Tokai TV', // i18n-ok
  'NHK総合': 'NHK General TV', // i18n-ok
  'NHK Eテレ': 'NHK E-TV', // i18n-ok
  'NHK BSプレミアム': 'NHK BS Premium', // i18n-ok
  '広島ホームテレビ': 'Hiroshima Home TV', // i18n-ok
  'さくらんぼテレビ': 'Sakuranbo TV', // i18n-ok
  'YBS山梨放送': 'YBS', // i18n-ok
  'BSS山陰放送': 'BSS', // i18n-ok
  'ABS秋田放送': 'ABS', // i18n-ok
  'テレビ西日本': 'TNC', // i18n-ok
  'TUTチューリップテレビ': 'TUT', // i18n-ok
  '愛媛朝日テレビ': 'eat', // i18n-ok
  'アニマックス': 'Animax', // i18n-ok
  'キッズステーション': 'Kids Station', // i18n-ok
  'BSアニマックス': 'BS Animax', // i18n-ok
  'ファミリー劇場': 'Family Gekijo', // i18n-ok
}

function labelOf(slot: Slot): string {
  const service = serviceOf(slot)?.label
  if (service) return service
  const ch = slot.ch.trim()
  return getLang() === 'en' ? (CHANNELS_EN[ch] ?? ch) : ch
}

// 選んだチャンネルの、これからの放送のうち、まだどのチャンネルでも流れていない回だけ（同じ回の遅れた配信を除く）。
// k（チャンネルごとの通し番号）が同じなら同じ回。選んだチャンネルのどれかで、これからの最初の放送の k がそれより大きければ、
// その回はもう流れている（例: 日曜0:30 に dアニメストアで第2話、火曜12:00 に Netflix で第2話 → 火曜の Netflix は出さない。2026-10-13）。
// k の無い予定（終わりの側から読んだ）は、そのまま残す
export function freshSlots(slots: readonly Slot[], p: BroadcastChoice, now: Date): Slot[] {
  const upcoming = slots.filter((slot) => {
    const at = Date.parse(slot.at)
    return Number.isFinite(at) && at > now.getTime() && matches(slot, p)
  })
  const firstK = new Map<string, number>()
  for (const slot of upcoming) {
    if (slot.k === undefined) continue
    const cur = firstK.get(slot.ch)
    if (cur === undefined || slot.k < cur) firstK.set(slot.ch, slot.k)
  }
  const aired = (k: number) => [...firstK.values()].some((first) => first > k)
  return upcoming.filter((slot) => slot.k === undefined || !aired(slot.k))
}

// 選んだチャンネルの中で、いまより後に始まる一番早い放送（まだ流れていない回の）
export function nextBroadcast(slots: readonly Slot[], p: BroadcastChoice, now: Date): NextBroadcast | null {
  let best: { at: number; labels: Set<string> } | null = null
  for (const slot of freshSlots(slots, p, now)) {
    const at = Date.parse(slot.at)
    if (!best || at < best.at) best = { at, labels: new Set([labelOf(slot)]) }
    else if (at === best.at) best.labels.add(labelOf(slot))
  }
  if (!best) return null
  return { at: new Date(best.at), channel: firstLabel(best.labels), more: best.labels.size > 1 }
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

// 日本の時刻で
const jst = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000)
const dayNumber = (d: Date) => Math.floor(jst(d).getTime() / 86400000)

// 「23:30」
export function formatTime(at: Date): string {
  const a = jst(at)
  return `${a.getUTCHours()}:${String(a.getUTCMinutes()).padStart(2, '0')}`
}

// 「今日」「明日」「10/18(日)」
export function formatDay(at: Date, now: Date): string {
  const diff = dayNumber(at) - dayNumber(now)
  if (diff === 0) return t('今日', 'Today')
  if (diff === 1) return t('明日', 'Tomorrow')
  const a = jst(at)
  const md = `${a.getUTCMonth() + 1}/${a.getUTCDate()}`
  return t(`${md}(${weekdayShort(a.getUTCDay())})`, `${md} (${weekdayShort(a.getUTCDay())})`)
}

// 「今日 23:30」「明日 0:00」「10/18(日) 0:00」
export function formatBroadcast(at: Date, now: Date): string {
  return `${formatDay(at, now)} ${formatTime(at)}`
}

// ── 今週の放送予定（見てるの作品の、これから7日の放送を日ごとに） ──
// 作品ごとに、同じ回はサービスが違っても1回だけ（一番早いもの）並べる。ほかのサービスで流れ終わった回の、遅れた配信は出さない（freshSlots）。
// 回は、チャンネルごとの通し番号（k）で見分ける。k の無い予定は、1つのチャンネルが7日のうちに放送する回数で回を数え、
// i 回目は各チャンネルの i 番目の放送のうち一番早いもの（2026-10-13: 時刻の間隔で分けたら、金曜の地上波と土曜の BS が別の回として2回並んだ。
// 7日だけを見ると、日曜の dアニメストアで流れた回の火曜の Netflix も新しい回に見えた）
export interface WeekItem<T> {
  work: T
  at: Date
  channel: string
  more: boolean
}

export function weekSchedule<T>(works: readonly { work: T; slots: readonly Slot[] }[], p: BroadcastChoice, now: Date): { day: string; items: WeekItem<T>[] }[] {
  const until = now.getTime() + 7 * 86400 * 1000
  const items: WeekItem<T>[] = []
  const add = (work: T, here: { at: number; label: string }[]) => {
    const first = Math.min(...here.map((x) => x.at))
    const labels = new Set(here.filter((x) => x.at === first).map((x) => x.label))
    items.push({ work, at: new Date(first), channel: firstLabel(labels), more: labels.size > 1 })
  }
  for (const { work, slots } of works) {
    const fresh = freshSlots(slots, p, now).filter((slot) => Date.parse(slot.at) <= until)
    // 回の番号（k）が分かる予定は、回ごとに一番早い放送を1回
    const byK = new Map<number, { at: number; label: string }[]>()
    for (const slot of fresh) {
      if (slot.k === undefined) continue
      const list = byK.get(slot.k) ?? []
      list.push({ at: Date.parse(slot.at), label: labelOf(slot) })
      byK.set(slot.k, list)
    }
    for (const here of byK.values()) add(work, here)
    // 分からない予定（終わりの側から読んだ）は、チャンネルごとの放送の順番で回をそろえる
    const byChannel = new Map<string, { at: number; label: string }[]>()
    for (const slot of fresh) {
      if (slot.k !== undefined) continue
      const list = byChannel.get(slot.ch) ?? []
      list.push({ at: Date.parse(slot.at), label: labelOf(slot) })
      byChannel.set(slot.ch, list)
    }
    const lists = [...byChannel.values()].map((l) => l.sort((a, b) => a.at - b.at))
    const rounds = Math.max(0, ...lists.map((l) => l.length))
    for (let i = 0; i < rounds; i++) add(work, lists.flatMap((l) => (l[i] ? [l[i]] : [])))
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime())
  const days: { day: string; items: WeekItem<T>[] }[] = []
  for (const item of items) {
    const day = formatDay(item.at, now)
    const last = days.at(-1)
    if (last?.day === day) last.items.push(item)
    else days.push({ day, items: [item] })
  }
  return days
}

export function broadcastLabel(next: NextBroadcast, now: Date): string {
  const when = formatBroadcast(next.at, now)
  return next.more
    ? t(`次の放送 ${when} ${next.channel}ほか`, `Next airing ${when} ${next.channel} and more`)
    : t(`次の放送 ${when} ${next.channel}`, `Next airing ${when} ${next.channel}`)
}
