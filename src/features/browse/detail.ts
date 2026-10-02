import type { StatusState } from '../../lib/annict'

// ブラウズの詳細画面で使う純粋な関数

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&nbsp;': ' ',
}

// AniList のあらすじは asHtml: false でも <br> や <i> が混ざる。タグを外して段落だけ残す（表示は React が文字として出す）
export function cleanDescription(text: string | null | undefined): string {
  if (!text) return ''
  return text
    // <br> の直後に改行文字が続くことが多い。合わせて1回の改行にする
    .replace(/<br\s*\/?>\n?/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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

export const STATUS_LABEL: Partial<Record<StatusState, string>> = {
  WATCHED: '見た',
  WATCHING: '見てる',
  WANNA_WATCH: '見たい',
  ON_HOLD: '一時中断',
  STOP_WATCHING: '視聴中止',
}
