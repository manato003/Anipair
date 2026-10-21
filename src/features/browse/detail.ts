import type { AnnictSeries, LibraryEntry, StatusState } from '../../lib/annict'
import { t, plural } from '../../lib/i18n'
import { workTitle } from '../../lib/names'
import { compareSeasons, seasonNameLabel, seasonOf, seasonOfWork } from '../../lib/season'
import { malIdOf } from '../../lib/malId'

// ブラウズの詳細画面で使う純粋な関数

// 「その他」を除き、同じ役職をまとめる。並びは Annict の並び順のまま
export function mainStaff(staffs: { role: string; name: string }[], limit = 10): { role: string; names: string[] }[] {
  const out: { role: string; names: string[] }[] = []
  for (const s of staffs) {
    // Annict の役職名は日本語のまま
    if (!s.role || s.role === 'その他') continue // i18n-ok
    const g = out.find((x) => x.role === s.role)
    if (g) {
      if (!g.names.includes(s.name)) g.names.push(s.name)
    } else if (out.length < limit) {
      out.push({ role: s.role, names: [s.name] })
    }
  }
  return out
}

// Annict の団体（制作会社）を、作品の Shikimori の制作会社に結びつける（制作会社の作品の一覧を開くため）。
// 英語名が一致（英数字だけで比べる。片方がもう片方を含むのも可）すればそれ。合わなくても、役職が「〜制作」（製作ではない）で
// 作品の制作会社が1社だけなら、その会社とみなす（製作委員会などを取り違えないよう「製作」では推定しない）
export function studioFor(
  org: { nameEn?: string | null },
  role: string,
  refs: readonly { id: number; name: string }[],
): { id: number; name: string } | null {
  const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')
  const en = org.nameEn ? key(org.nameEn) : ''
  if (en) {
    const exact = refs.find((r) => key(r.name) === en)
    if (exact) return exact
    const loose = refs.find((r) => key(r.name).length >= 4 && (en.includes(key(r.name)) || key(r.name).includes(en)))
    if (loose) return loose
  }
  return refs.length === 1 && role.includes('制作') && !role.includes('製作') ? refs[0] : null // i18n-ok: Annict の役職名（日本語）との比較
}

// 外部サイトから来た URL は http(s) のものだけ使う（javascript: などを弾く）
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
  } catch {
    return null
  }
}

export function xUrl(username: string | null | undefined): string | null {
  return username && /^\w{1,15}$/.test(username) ? `https://x.com/${username}` : null
}

// 季節の名前（Annict の 'WINTER' などから）。呼んだときの言語で
function seasonWord(name: string): string {
  const s = seasonOfWork({ seasonYear: 0, seasonName: name })
  return s ? seasonNameLabel(s.name) : ''
}

// 形式の名前は、呼んだときの言語で（ファイルの外側で t() を呼ばないため、関数にする）
function mediaWord(media: string): string {
  switch (media) {
    case 'TV':
      return 'TV'
    case 'OVA':
      return 'OVA'
    case 'MOVIE':
      return t('劇場版', 'Movie')
    case 'WEB':
      return t('配信', 'ONA')
    case 'OTHER':
      return t('その他', 'Other')
    default:
      return media
  }
}

// 分からない項目は省く（詳細を読む前のシートは、手元にある項目だけで出す）。日本語は「2026年秋 TV 12話」、英語は「Fall 2026 · TV · 12 episodes」
export function workMeta(w: { seasonYear?: number | null; seasonName?: string | null; media?: string }, episodes?: number): string {
  const season = w.seasonYear
    ? t(`${w.seasonYear}年${w.seasonName ? seasonWord(w.seasonName) : ''}`, `${w.seasonName ? `${seasonWord(w.seasonName)} ` : ''}${w.seasonYear}`)
    : ''
  const media = w.media ? mediaWord(w.media) : ''
  const parts = [season, media, episodes ? t(`${episodes}話`, plural(episodes, 'episode', 'episodes')) : '']
  return parts.filter(Boolean).join(t(' ', ' · '))
}

// 画面での状態の名前。「途中で見るのをやめた」はアプリ全体で「視聴中断」の1つだけにする（どちらを押すか迷わせないため）。
// Anipair からは STOP_WATCHING（Annict の「視聴中止」）で保存し、Annict のサイトで付けた ON_HOLD（一時中断）も同じ名前で見せる
export const STATUS_LABEL: Partial<Record<StatusState, string>> = {
  get WATCHED() {
    return t('見た', 'Watched')
  },
  get WATCHING() {
    return t('見てる', 'Watching')
  },
  get WANNA_WATCH() {
    return t('見たい', 'Want to watch')
  },
  get ON_HOLD() {
    return t('視聴中断', 'Dropped')
  },
  get STOP_WATCHING() {
    return t('視聴中断', 'Dropped')
  },
}

// Shikimori の作品の形式の名前（参加作品・似た作品の一覧）
export const FORMAT_LABEL: Record<string, string> = {
  TV: 'TV',
  get MOVIE() {
    return t('劇場版', 'Movie')
  },
  OVA: 'OVA',
  get ONA() {
    return t('配信', 'ONA')
  },
  get TV_SPECIAL() {
    return t('TVスペシャル', 'TV special')
  },
  get SPECIAL() {
    return t('スペシャル', 'Special')
  },
  MUSIC: 'MV',
}

// 自分の記録の印（見た・見たいなど）を、MyAnimeList の ID ごとに引けるようにする（参加作品・似た作品の一覧に添える）
export function marksByMal(entries: readonly Pick<LibraryEntry, 'malAnimeId' | 'state'>[] | null): Map<number, string> {
  const out = new Map<number, string>()
  for (const e of entries ?? []) {
    const mal = malIdOf(e)
    const label = STATUS_LABEL[e.state]
    if (mal && label) out.set(mal, label)
  }
  return out
}

// 権利表記には先頭に ©。Annict の文字に © や (c) がもう入っていれば、そのまま出す
export function withCopyrightMark(text: string | null | undefined): string | null {
  const body = text?.trim()
  if (!body) return null
  return /[©Ⓒ]|\(c\)/i.test(body) ? body : `© ${body}`
}

// 「データで見る」のシリーズの行（2026-10-07、myanimecheck.com を参考に）: 何作目か、次の作品（まだ放送前なら「放送予定の続編」）。
// Annict のシリーズ（利用者が整理したもの。作品は放送時期の順）のうち、開いた作品と同じ形式（TV なら TV）の作品だけで数える
// （ミニアニメや特番が「次の作品」になると、次に見る1本の手がかりにならない。葬送のフリーレンで、次がミニアニメになっていた）。同じ形式が2作以上あるときだけ
function seriesKind(media: string): { ja: string; en: string } {
  switch (media) {
    case 'TV':
      return { ja: 'TVシリーズ', en: 'TV series' }
    case 'MOVIE':
      return { ja: '劇場版', en: 'Movie' }
    case 'OVA':
      return { ja: 'OVA', en: 'OVA' }
    case 'WEB':
      return { ja: '配信作品', en: 'Web series' }
    default:
      return { ja: '作品', en: 'Anime' }
  }
}
export function seriesFacts(series: readonly AnnictSeries[] | null | undefined, annictId: number, now: Date = new Date()): [string, string][] {
  const s = series?.find((x) => x.works.some((w) => w.annictId === annictId))
  const self = s?.works.find((w) => w.annictId === annictId)
  if (!s || !self) return []
  const works = s.works.filter((w) => w.media === self.media)
  if (works.length < 2) return []
  const at = works.findIndex((w) => w.annictId === annictId)
  const kind = seriesKind(self.media)
  const rows: [string, string][] = [
    [t('シリーズ', 'Series'), t(`${kind.ja}の${at + 1}作目（全${works.length}作）`, `${kind.en}: ${at + 1} of ${works.length}`)],
  ]
  const next = works[at + 1]
  if (next) {
    const season = workMeta({ seasonYear: next.seasonYear, seasonName: next.seasonName })
    const nextSeason = seasonOfWork(next)
    const upcoming = !!nextSeason && compareSeasons(nextSeason, seasonOf(now)) > 0
    // 作品名は Annict のデータのまま
    const shown = workTitle(next)
    const title = t(`『${shown}』`, `“${shown}”`)
    const paren = season ? t(`（${season}）`, ` (${season})`) : ''
    rows.push(upcoming ? [t('放送予定の続編', 'Upcoming sequel'), t(`${title}${season}`, `${title} ${season}`)] : [t('次の作品', 'Next'), `${title}${paren}`])
  }
  return rows
}
