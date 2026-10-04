// 作品のあらすじを、日本語版 Wikipedia の公式の API（MediaWiki）から読む。
// 記事の URL は Annict の API が返す `wikipediaUrl`。文章は CC BY-SA 4.0 なので、出典（記事名とリンク）とライセンスを添えて出す。
// ネタバレを避けるため、「あらすじ」の節の冒頭の段落だけを使う（後ろの段落ほど物語の先まで書かれている）。
// Annict・Shikimori・MyAnimeList には、日本語で権利のはっきりしたあらすじが無い（docs/concept.md の設計の原則）

const API = 'https://ja.wikipedia.org/w/api.php'
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja'

// あらすじの節の中身の1かたまり（小見出しか段落）
export interface WikiBlock {
  heading: boolean
  text: string
}

export interface WikiSynopsis {
  // 冒頭の段落（160字ほどで切ったもの。最初に見せる）
  text: string
  // 節の全文（小見出しと段落の並び）。「続きを読む」で広げて見せる
  blocks: WikiBlock[]
  // 記事名（転送のあとの名前）。シリーズ全体の記事から取ったときは、ここで分かる
  title: string
  // あらすじの節へのリンク（出典）
  url: string
  licenseUrl: string
}

// あらすじに当たる節の名前
const SECTION = /^(あらすじ|ストーリー|物語|概要・あらすじ|ストーリー・あらすじ)$/

// Annict の wikipediaUrl から、日本語版の記事名を取り出す。日本語版でなければ null
export function wikiTitleOf(url: string | null | undefined): string | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.hostname !== 'ja.wikipedia.org' && u.hostname !== 'ja.m.wikipedia.org') return null
  const m = u.pathname.match(/^\/wiki\/(.+)$/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ')
  } catch {
    return null
  }
}

// 節の一覧から、あらすじの節を選ぶ（いちばん最初に出てくるもの）
export function pickSynopsisSection(sections: readonly { line: string; index: string; anchor: string }[]): { index: string; anchor: string } | null {
  const hit = sections.find((s) => SECTION.test(stripTags(s.line).trim()))
  return hit ? { index: hit.index, anchor: hit.anchor } : null
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

// 出す長さの目安。文の区切り（。）で切り、これを超えたら「…」にする（長い段落の後ろは、解決や結末まで書かれていることが多い）
const MAX_CHARS = 160

// 記事の説明で、あらすじではない段落（「本稿では…と記述する」など）
const META = /^(本稿|本項|本節|この節|以下)|記述する/

function tidy(text: string | null): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/（\s*）|\(\s*\)/g, '')
    .trim()
}

// 節の HTML を、冒頭の段落と全文に分ける。注の番号・編集のリンク・表・画像の説明は除く。
// 冒頭は、短すぎる段落（案内の一言など）と記事の説明の段落を飛ばした最初の段落を、文の区切りで短くしたもの。
// 全文は、節の見出しのあとの小見出しと段落の並び（記事の説明の段落は除く）。冒頭の段落が無ければ null
export function parseSynopsis(html: string): { text: string; blocks: WikiBlock[] } | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of doc.querySelectorAll('sup.reference, .mw-editsection, .hatnote, table, figure, .thumb, style, script')) el.remove()
  const blocks: WikiBlock[] = []
  let lead: string | null = null
  const nodes = [...doc.querySelectorAll('h3, h4, h5, p')]
  for (const el of nodes) {
    const text = tidy(el.textContent)
    if (!text) continue
    if (el.tagName === 'P') {
      if (META.test(text)) continue
      if (lead === null && text.length >= 30) lead = text
      if (lead !== null) blocks.push({ heading: false, text })
    } else if (lead !== null || blocks.length === 0) {
      blocks.push({ heading: true, text })
    }
  }
  if (lead === null) return null
  // 冒頭より前の小見出しは、全文の先頭に残す（「第1巻」など、最初の段落の見出し）
  return { text: clip(lead), blocks }
}

// 冒頭の段落だけ（parseSynopsis の text）
export function firstParagraph(html: string): string | null {
  return parseSynopsis(html)?.text ?? null
}

// 文の区切りで、MAX_CHARS に収まるところまで（最初の1文は必ず残す）
export function clip(text: string): string {
  if (text.length <= MAX_CHARS) return text
  const sentences = text.match(/[^。]+。?/g) ?? [text]
  let out = ''
  for (const s of sentences) {
    if (out && (out + s).length > MAX_CHARS) break
    out += s
  }
  return out.length < text.length ? `${out}…` : out
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(`${API}?${q.toString()}`, { credentials: 'omit' })
  if (!res.ok) throw new Error(`Wikipedia を読めませんでした（HTTP ${res.status}）`)
  return (await res.json()) as T
}

const cache = new Map<string, Promise<WikiSynopsis | null>>()

// 記事ごとに1回だけ読む（節の一覧と、あらすじの節の2回の問い合わせ）。あらすじの節が無い記事は null
export function fetchWikiSynopsis(wikipediaUrl: string | null | undefined): Promise<WikiSynopsis | null> {
  const page = wikiTitleOf(wikipediaUrl)
  if (!page) return Promise.resolve(null)
  let p = cache.get(page)
  if (!p) {
    p = (async () => {
      const s = await call<{ parse?: { title: string; sections: { line: string; index: string; anchor: string }[] } }>({ action: 'parse', page, prop: 'sections', redirects: '1' })
      if (!s.parse) return null
      const section = pickSynopsisSection(s.parse.sections)
      if (!section) return null
      const t = await call<{ parse?: { text: string } }>({ action: 'parse', page: s.parse.title, section: section.index, prop: 'text', disableeditsection: '1' })
      const parsed = t.parse ? parseSynopsis(t.parse.text) : null
      if (!parsed) return null
      const title = s.parse.title
      return {
        text: parsed.text,
        blocks: parsed.blocks,
        title,
        url: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}#${encodeURIComponent(section.anchor)}`,
        licenseUrl: LICENSE_URL,
      }
    })()
    p.catch(() => cache.delete(page))
    cache.set(page, p)
  }
  return p
}
