import type { StatusState } from '../../lib/annict'

// ブラウズの詳細画面で使う純粋な関数

// 「その他」を除き、同じ役職をまとめる。並びは Annict の並び順のまま
export function mainStaff(staffs: { role: string; name: string }[], limit = 10): { role: string; names: string[] }[] {
  const out: { role: string; names: string[] }[] = []
  for (const s of staffs) {
    if (!s.role || s.role === 'その他') continue
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
  return refs.length === 1 && role.includes('制作') && !role.includes('製作') ? refs[0] : null
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

const SEASON_JA: Record<string, string> = { WINTER: '冬', SPRING: '春', SUMMER: '夏', AUTUMN: '秋' }

const MEDIA_JA: Record<string, string> = { TV: 'TV', OVA: 'OVA', MOVIE: '劇場版', WEB: '配信', OTHER: 'その他' }

// 分からない項目は省く（詳細を読む前のシートは、手元にある項目だけで出す）
export function workMeta(w: { seasonYear?: number | null; seasonName?: string | null; media?: string }, episodes?: number): string {
  const season = w.seasonYear ? `${w.seasonYear}年${w.seasonName ? SEASON_JA[w.seasonName] ?? '' : ''}` : ''
  const media = w.media ? MEDIA_JA[w.media] ?? w.media : ''
  const parts = [season, media, episodes ? `${episodes}話` : '']
  return parts.filter(Boolean).join(' ')
}

// 画面での状態の名前。「途中で見るのをやめた」はアプリ全体で「視聴中断」の1つだけにする（どちらを押すか迷わせないため）。
// Anipair からは STOP_WATCHING（Annict の「視聴中止」）で保存し、Annict のサイトで付けた ON_HOLD（一時中断）も同じ名前で見せる
export const STATUS_LABEL: Partial<Record<StatusState, string>> = {
  WATCHED: '見た',
  WATCHING: '見てる',
  WANNA_WATCH: '見たい',
  ON_HOLD: '視聴中断',
  STOP_WATCHING: '視聴中断',
}

// 権利表記には先頭に ©。Annict の文字に © や (c) がもう入っていれば、そのまま出す
export function withCopyrightMark(text: string | null | undefined): string | null {
  const t = text?.trim()
  if (!t) return null
  return /[©Ⓒ]|\(c\)/i.test(t) ? t : `© ${t}`
}
