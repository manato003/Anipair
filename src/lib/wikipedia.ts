import { getLang, t, type Lang } from './i18n'
import { persistedMap } from './persistedMap'

// 作品のあらすじを、日本語版 Wikipedia の公式の API（MediaWiki）から読む。
// 記事の URL は Annict の API が返す `wikipediaUrl`。文章は CC BY-SA 4.0 なので、出典（記事名とリンク）とライセンスを添えて出す。
// ネタバレを避けるため、「あらすじ」の節の冒頭の段落だけを使う（後ろの段落ほど物語の先まで書かれている）。
// Annict・Shikimori・MyAnimeList には、日本語で権利のはっきりしたあらすじが無い（設計の原則）
// 英語の画面では、日本語版の記事から英語版の記事（言語間リンク）をたどり、英語版の「Plot」などの節の冒頭を使う。
// 英語版の記事か、その節が無ければ、日本語版のあらすじを出す（2026-10-20 利用者）

const HOSTS: Record<Lang, string> = { ja: 'ja.wikipedia.org', en: 'en.wikipedia.org' }
const LICENSE_URLS: Record<Lang, string> = {
  ja: 'https://creativecommons.org/licenses/by-sa/4.0/deed.ja',
  en: 'https://creativecommons.org/licenses/by-sa/4.0/',
}

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
  // どちらの言語版の記事から取ったか（英語の画面でも、英語版が無ければ日本語版）
  lang: Lang
}

// あらすじに当たる節の名前
// 日本語版 Wikipedia の節の名前と照合する（データ）
const SECTION = /^(あらすじ|ストーリー|物語|概要・あらすじ|ストーリー・あらすじ)$/ // i18n-ok: 日本語版 Wikipedia の節名との照合
const SECTION_EN = /^(plot|synopsis|story|premise|plot summary|plot overview|setting and plot)$/i

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
export function pickSynopsisSection(sections: readonly { line: string; index: string; anchor: string }[], lang: Lang = 'ja'): { index: string; anchor: string } | null {
  const pattern = lang === 'en' ? SECTION_EN : SECTION
  const hit = sections.find((s) => pattern.test(stripTags(s.line).trim()))
  return hit ? { index: hit.index, anchor: hit.anchor } : null
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

// 出す長さの目安。文の区切り（。）で切り、これを超えたら「…」にする（長い段落の後ろは、解決や結末まで書かれていることが多い）
const MAX_CHARS = 160
// 英語は同じ内容でも字数が多い（日本語の 160 字はおよそ英語の 2 倍）
const MAX_CHARS_EN = 320

// 記事の説明で、あらすじではない段落（「本稿では…と記述する」など）
const META = /^(本稿|本項|本節|この節|以下)|記述する/ // i18n-ok: 日本語版 Wikipedia の本文との照合
const META_EN = /^(this (article|section)|the following|see also)\b/i

function tidy(text: string | null): string {
  return (text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/（\s*）|\(\s*\)/g, '') // i18n-ok: 日本語版 Wikipedia の本文から空の括弧を除く
    .trim()
}

// 節の HTML を、冒頭の段落と全文に分ける。注の番号・編集のリンク・表・画像の説明は除く。
// 冒頭は、短すぎる段落（案内の一言など）と記事の説明の段落を飛ばした最初の段落を、文の区切りで短くしたもの。
// 全文は、節の見出しのあとの小見出しと段落の並び（記事の説明の段落は除く）。冒頭の段落が無ければ null。
// ownHeading: 節そのものの見出し（節が h3 のとき、その見出しを小見出しとして並べない。2026-10-06 の点検で見つけた:
// 短い1段落でも「続きを読む」が出て、開くと「あらすじ」が小見出しとして重なっていた）
export function parseSynopsis(html: string, ownHeading?: string, lang: Lang = 'ja'): { text: string; blocks: WikiBlock[] } | null {
  const meta = lang === 'en' ? META_EN : META
  const minLead = lang === 'en' ? 60 : 30
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of doc.querySelectorAll('sup.reference, .mw-editsection, .hatnote, table, figure, .thumb, style, script')) el.remove()
  const blocks: WikiBlock[] = []
  let lead: string | null = null
  const nodes = [...doc.querySelectorAll('h3, h4, h5, p')]
  for (const el of nodes) {
    const text = tidy(el.textContent)
    if (!text) continue
    if (el.tagName === 'P') {
      if (meta.test(text)) continue
      if (lead === null && text.length >= minLead) lead = text
      if (lead !== null) blocks.push({ heading: false, text })
    } else if (ownHeading !== undefined && text === tidy(ownHeading)) {
      continue
    } else if (lead !== null || blocks.length === 0) {
      blocks.push({ heading: true, text })
    }
  }
  if (lead === null) return null
  // 冒頭より前の小見出しは、全文の先頭に残す（「第1巻」など、最初の段落の見出し）
  return { text: clip(lead, lang), blocks }
}

// 冒頭の段落だけ（parseSynopsis の text）
export function firstParagraph(html: string): string | null {
  return parseSynopsis(html)?.text ?? null
}

// 文の区切りで、MAX_CHARS に収まるところまで（最初の1文は必ず残す）
export function clip(text: string, lang: Lang = 'ja'): string {
  const max = lang === 'en' ? MAX_CHARS_EN : MAX_CHARS
  if (text.length <= max) return text
  // i18n-ok: 本文を文で区切る（日本語は「。」、英語は . ! ?）
  const sentences = (lang === 'en' ? text.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) : text.match(/[^。]+。?/g)) ?? [text] // i18n-ok
  let out = ''
  for (const s of sentences) {
    if (out && (out + s).length > max) break
    out += s
  }
  out = out.trimEnd()
  return out.length < text.trimEnd().length ? `${out}…` : out
}

async function call<T>(lang: Lang, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams({ ...params, format: 'json', formatversion: '2', origin: '*' })
  const res = await fetch(`https://${HOSTS[lang]}/w/api.php?${q.toString()}`, { credentials: 'omit' })
  if (!res.ok) throw new Error(t(`Wikipediaを読めませんでした（HTTP ${res.status}）`, `Could not load Wikipedia (HTTP ${res.status}).`))
  return (await res.json()) as T
}

const cache = new Map<string, Promise<WikiSynopsis | null>>()

// 読んだあらすじは端末にも残す（次に開いたときは問い合わせない。2026-10-21）。記事は書き換わるので、
// あらすじが見つかった記事は30日、あらすじの節が無かった記事は7日たったら読み直す。残すのは新しく読んだ60件
const FOUND_MS = 30 * 86_400_000
const MISSING_MS = 7 * 86_400_000
interface StoredSynopsis {
  at: string
  v: WikiSynopsis | null
}
const stored = persistedMap<StoredSynopsis>('wikiSynopses', 60, parseStoredSynopsis)

// 端末に残したあらすじの形を確かめる。リンクは、その言語版の Wikipedia のものだけ通す
export function parseStoredSynopsis(value: unknown): StoredSynopsis | null {
  if (!value || typeof value !== 'object') return null
  const { at, v } = value as Record<string, unknown>
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null
  if (v === null) return { at, v: null }
  if (!v || typeof v !== 'object') return null
  const w = v as Record<string, unknown>
  const lang = w.lang === 'en' || w.lang === 'ja' ? w.lang : null
  if (!lang || typeof w.text !== 'string' || typeof w.title !== 'string' || typeof w.url !== 'string' || !w.url.startsWith(`https://${HOSTS[lang]}/`) || !Array.isArray(w.blocks)) return null
  const blocks = w.blocks.flatMap((b: unknown) => {
    const x = b as Record<string, unknown> | null
    return x && typeof x.heading === 'boolean' && typeof x.text === 'string' ? [{ heading: x.heading, text: x.text }] : []
  })
  return { at, v: { text: w.text, blocks, title: w.title, url: w.url, licenseUrl: LICENSE_URLS[lang], lang } }
}

function storedSynopsis(key: string, now = Date.now()): StoredSynopsis | undefined {
  const s = stored.get(key)
  if (!s) return undefined
  return now - Date.parse(s.at) < (s.v ? FOUND_MS : MISSING_MS) ? s : undefined
}

// 1つの言語版の記事から、あらすじの節を読む（節の一覧と、あらすじの節の2回の問い合わせ）。節が無ければ null
async function readSynopsis(lang: Lang, page: string): Promise<WikiSynopsis | null> {
  const s = await call<{ parse?: { title: string; sections: { line: string; index: string; anchor: string }[] } }>(lang, { action: 'parse', page, prop: 'sections', redirects: '1' })
  if (!s.parse) return null
  const section = pickSynopsisSection(s.parse.sections, lang)
  if (!section) return null
  const body = await call<{ parse?: { text: string } }>(lang, { action: 'parse', page: s.parse.title, section: section.index, prop: 'text', disableeditsection: '1' })
  const parsed = body.parse ? parseSynopsis(body.parse.text, section.anchor.replace(/_/g, ' '), lang) : null
  if (!parsed) return null
  const title = s.parse.title
  return {
    text: parsed.text,
    blocks: parsed.blocks,
    title,
    url: `https://${HOSTS[lang]}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}#${encodeURIComponent(section.anchor)}`,
    licenseUrl: LICENSE_URLS[lang],
    lang,
  }
}

// 日本語版の記事名から、英語版の記事名（言語間リンク）。無ければ null
async function englishTitleOf(page: string): Promise<string | null> {
  const r = await call<{ query?: { pages?: { langlinks?: { title: string }[] }[] } }>('ja', { action: 'query', titles: page, prop: 'langlinks', lllang: 'en', redirects: '1' })
  return r.query?.pages?.[0]?.langlinks?.[0]?.title ?? null
}

// 記事ごと・言語ごとに1回だけ読む。英語の画面では英語版を先に試し、無ければ日本語版。あらすじの節が無い記事は null
export function fetchWikiSynopsis(wikipediaUrl: string | null | undefined, lang: Lang = getLang()): Promise<WikiSynopsis | null> {
  const page = wikiTitleOf(wikipediaUrl)
  if (!page) return Promise.resolve(null)
  const key = `${lang}:${page}`
  let p = cache.get(key)
  if (!p) {
    const kept = storedSynopsis(key)
    if (kept) {
      p = Promise.resolve(kept.v)
      cache.set(key, p)
      return p
    }
    p = (async () => {
      // 英語版を読めなかった（通信の失敗）ときは、日本語版で代わりに出しても端末には残さない（次は英語版をもう一度試す）
      let enFailed = false
      if (lang === 'en') {
        const en = await englishTitleOf(page).catch(() => ((enFailed = true), null))
        const synopsis = en ? await readSynopsis('en', en).catch(() => ((enFailed = true), null)) : null
        if (synopsis) {
          stored.set(key, { at: new Date().toISOString(), v: synopsis })
          return synopsis
        }
      }
      const ja = await readSynopsis('ja', page)
      if (!enFailed) stored.set(key, { at: new Date().toISOString(), v: ja })
      return ja
    })()
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}
