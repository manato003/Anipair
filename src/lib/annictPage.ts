import { annictWorkUrl, schedule } from './annict'

// Annict の API には作品のあらすじと配信サービスが無い（GraphQL の Work に項目が無い）が、作品ページには載っている。
// ページは access-control-allow-origin: * で配信されるので、ブラウザから直接読んで取り出す（2026-09-30 に確認）。
// 利用規約が禁じるのは過度な負荷なので、詳細を開いたときに1ページだけ読み、読んだものは使い回す

export interface Synopsis {
  text: string
  // 「引用元: https://...」の URL。無ければ null
  source: string | null
}

// 行ごとの前後の空白を落とし、<br> の前にある改行文字で生まれる空行を詰める
function tidy(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

// 配信サービスへのリンク（作品ページの見出しに並ぶ丸いボタン）
export interface Vod {
  name: string
  url: string
}

export interface WorkPage {
  synopsis: Synopsis | null
  vods: Vod[]
}

// 「あらすじ」の見出しの次の枠だけを見る
// （同じ見た目の枠が感想にも使われているので、枠の名前だけで探すと他人の感想を拾う）
function synopsisOf(doc: Document): Synopsis | null {
  const heading = [...doc.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'あらすじ')
  const block = heading?.closest('.container')?.nextElementSibling
  const content = block?.querySelector('.c-body__content')
  if (!block || !content) return null
  for (const el of content.querySelectorAll('script, style')) el.remove()
  for (const br of content.querySelectorAll('br')) br.replaceWith('\n')
  const paragraphs = content.querySelectorAll('p')
  const parts = paragraphs.length ? [...paragraphs].map((p) => tidy(p.textContent ?? '')) : [tidy(content.textContent ?? '')]
  const text = parts.filter(Boolean).join('\n\n')
  if (!text) return null
  const cite = [...block.querySelectorAll('.text-muted')].map((e) => e.textContent ?? '').find((t) => t.includes('引用元'))
  const url = cite?.match(/引用元[:：]\s*(\S+)/)?.[1] ?? null
  return { text, source: url && /^https?:\/\//.test(url) ? url : null }
}

// 配信サービスは、一覧（ul.list-inline）の中の丸いボタン（a.rounded-pill.btn-outline-primary）。
// 公式サイトや Wikipedia は同じ一覧でも丸くない別のリンクなので拾わない。http(s) だけ、URL の重複は除き、ページの並びのまま
function vodsOf(doc: Document): Vod[] {
  const out: Vod[] = []
  for (const a of doc.querySelectorAll('ul.list-inline a.rounded-pill.btn-outline-primary')) {
    const name = a.textContent?.trim()
    const href = a.getAttribute('href')
    if (!name || !href || !/^https?:\/\//i.test(href) || out.some((v) => v.url === href)) continue
    out.push({ name, url: href })
  }
  return out
}

// 作品ページの見た目（スタイルシートの読み込み・style 属性）は使わない。解析するだけの文書でも、
// ブラウザは「このサイトの CSP に反する」と数えてコンソールに違反を出すので、解析の前に取り除く
function withoutStyling(html: string): string {
  return html
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '')
}

// 作品ページの HTML を1回だけ解析して、あらすじと配信サービスを取り出す
export function parseWorkPage(html: string): WorkPage {
  const doc = new DOMParser().parseFromString(withoutStyling(html), 'text/html')
  return { synopsis: synopsisOf(doc), vods: vodsOf(doc) }
}

const cache = new Map<number, WorkPage>()

// 作品ごとに1回だけ読む（API と同じ1秒約3回の列に並べる）
export async function fetchWorkPage(annictId: number): Promise<WorkPage> {
  const cached = cache.get(annictId)
  if (cached) return cached
  const result = await schedule(async () => {
    const res = await fetch(annictWorkUrl(annictId), { credentials: 'omit' })
    if (!res.ok) throw new Error(`Annict の作品ページを読めませんでした（HTTP ${res.status}）`)
    return parseWorkPage(await res.text())
  })
  cache.set(annictId, result)
  return result
}
