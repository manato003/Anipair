// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { parseSupporter, parseWorkPage } from './annictPage'

const parseSynopsis = (html: string) => parseWorkPage(html).synopsis

// 2026-09-30 時点の annict.com/works/:id の構造を最小限に再現したもの
function page(body: string) {
  return `<!doctype html><html><body>${body}</body></html>`
}

const review = (text: string) => `
  <div class="container"><div class="card"><div class="card-body">
    <div class="c-body"><div class="c-body__content" data-body-target="content"><p>${text}</p></div></div>
  </div></div></div>`

const synopsisBlock = (content: string, cite = '') => `
  <div class="container mt-5">
    <h2 class="fw-bold h3 mb-3">
      あらすじ
    </h2>
  </div>
  <div class="container u-container-flat">
    <div class="card u-card-flat"><div class="card-body">
      <div class="c-body " data-controller="body"><div class="c-body__content" data-body-target="content">${content}</div></div>
      ${cite ? `<div class="text-end text-muted u-very-small">\n          ${cite}\n        </div>` : ''}
    </div></div>
  </div>`

describe('parseWorkPage: synopsis', () => {
  it('takes the block after the heading, keeps line breaks and drops the stray blank lines', () => {
    const html = page(
      review('他人の感想（前）') +
        synopsisBlock(
          '<p>勇者ヒンメルたちと共に、魔王を打ち倒し\n<br />世界に平和をもたらした魔法使いフリーレン。\n<br />それから50年後――。</p>',
          '引用元: https://frieren-anime.jp/story/',
        ) +
        review('他人の感想（後）'),
    )
    expect(parseSynopsis(html)).toEqual({
      text: '勇者ヒンメルたちと共に、魔王を打ち倒し\n世界に平和をもたらした魔法使いフリーレン。\nそれから50年後――。',
      source: 'https://frieren-anime.jp/story/',
    })
  })

  it('separates paragraphs with a blank line and works without a source', () => {
    const html = page(synopsisBlock('<p>一段落目。</p><p>二段落目。<br>続き。</p>'))
    expect(parseSynopsis(html)).toEqual({ text: '一段落目。\n\n二段落目。\n続き。', source: null })
  })

  it('returns null when the page has no synopsis, even if reviews use the same kind of block', () => {
    expect(parseSynopsis(page(review('他人の感想') + '<h2>エピソード</h2>'))).toBeNull()
  })

  it('ignores a source that is not an http(s) URL', () => {
    const html = page(synopsisBlock('<p>本文</p>', '引用元: javascript:alert(1)'))
    expect(parseSynopsis(html)?.source).toBeNull()
  })

  it('does not execute or keep markup from the page', () => {
    const html = page(synopsisBlock('<p>本文<script>window.__x = 1</script><b>太字</b></p>'))
    const s = parseSynopsis(html)
    expect(s?.text).toBe('本文太字')
    expect((window as unknown as { __x?: number }).__x).toBeUndefined()
  })
})

describe('parseWorkPage: styling', () => {
  it('still reads the page when stylesheets and style attributes are present (they are dropped before parsing)', () => {
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="https://annict.com/assets/application.css"><style>.x{color:red}</style></head><body>' +
      synopsisBlock('<p style="color:red">本文</p>', '引用元: https://example.com/src').replace('<div class="card u-card-flat">', "<div class=\"card\" style='margin:0'>") +
      '</body></html>'
    expect(parseSynopsis(html)).toEqual({ text: '本文', source: 'https://example.com/src' })
  })

  it('does not load or keep the stylesheet link, the style block or style attributes in the parsed document', () => {
    const seen: string[] = []
    const original = DOMParser.prototype.parseFromString
    DOMParser.prototype.parseFromString = function (this: DOMParser, html: string, type: DOMParserSupportedType) {
      seen.push(html)
      return original.call(this, html, type)
    }
    try {
      parseWorkPage('<html><head><link rel="stylesheet" href="x.css"><style>a{}</style></head><body><p style="x:y">a</p></body></html>')
    } finally {
      DOMParser.prototype.parseFromString = original
    }
    expect(seen[0]).not.toMatch(/<link|<style|style=/)
  })
})

// 2026-09-30 時点の作品ページの見出し部分（公式サイト・Wikipedia は丸くないリンク、配信サービスは丸いボタン）
const pill = (href: string, name: string) =>
  `<li class="list-inline-item mt-2"><a class="btn btn-outline-primary btn-sm rounded-pill" href="${href}" target="_blank" rel="noopener">${name}<i class="fa-solid fa-external-link-alt ms-1 small"></i></a></li>`

const header = (pills: string) => `
  <ul class="list-inline mb-0">
    <li class="list-inline-item"><a href="https://frieren-anime.jp/" target="_blank" rel="noopener">公式サイト<i class="fa-solid fa-external-link-alt ms-1 small"></i></a></li>
    <li class="list-inline-item"><a href="https://ja.wikipedia.org/wiki/x" target="_blank" rel="noopener">Wikipedia<i class="fa-solid fa-external-link-alt ms-1 small"></i></a></li>
  </ul>
  <ul class="list-inline mt-2">${pills}</ul>`

describe('parseWorkPage: streaming services', () => {
  it('takes the pill links in page order, without the official site and Wikipedia', () => {
    const html = page(
      header(
        pill('https://www.b-ch.com/ttl/index.php?ttl_c=8259', 'バンダイチャンネル') +
          pill('https://animestore.docomo.ne.jp/animestore/ci_pc?workId=26609', 'dアニメストア') +
          pill('https://www.netflix.com/title/81726714', 'Netflix'),
      ),
    )
    expect(parseWorkPage(html).vods).toEqual([
      { name: 'バンダイチャンネル', url: 'https://www.b-ch.com/ttl/index.php?ttl_c=8259' },
      { name: 'dアニメストア', url: 'https://animestore.docomo.ne.jp/animestore/ci_pc?workId=26609' },
      { name: 'Netflix', url: 'https://www.netflix.com/title/81726714' },
    ])
  })

  it('drops links that are not http(s), duplicates and nameless pills', () => {
    const html = page(
      header(
        pill('javascript:alert(1)', '危ない') +
          pill('/works/1', '相対') +
          pill('https://abema.tv/video/title/19-171', 'ABEMAビデオ') +
          pill('https://abema.tv/video/title/19-171', 'ABEMA（重複）') +
          pill('https://example.com/', ''),
      ),
    )
    expect(parseWorkPage(html).vods).toEqual([{ name: 'ABEMAビデオ', url: 'https://abema.tv/video/title/19-171' }])
  })

  it('returns an empty list for a page with no streaming list, and parses both parts from one page', () => {
    expect(parseWorkPage(page(synopsisBlock('<p>本文</p>'))).vods).toEqual([])
    const both = parseWorkPage(page(header(pill('https://www.netflix.com/title/1', 'Netflix')) + synopsisBlock('<p>本文</p>')))
    expect(both.synopsis?.text).toBe('本文')
    expect(both.vods).toHaveLength(1)
  })
})

describe('parseSupporter', () => {
  // プロフィールページの見出し（2026-10-04 の annict.com/@shimbaco の形）
  const header = (user: string, badge: boolean) =>
    `<div class="row"><div class="col">${badge ? '<div class="badge u-bg-supporter">サポーター</div>' : ''}<h1 class="h2"><a class="text-body" href="/@${user}">名前</a></h1></div></div>`
  // サポーターでない人のページにもある案内
  const sidebar = '<div class="small text-muted"><a href="/supporters">Annictサポーター</a>になると広告を非表示にできます。</div>'

  it('finds the supporter badge next to the name', () => {
    expect(parseSupporter(`<html><body>${header('shimbaco', true)}${sidebar}</body></html>`, 'shimbaco')).toBe(true)
  })

  it('is not fooled by the supporter guide in the sidebar, or by a badge next to someone else', () => {
    expect(parseSupporter(`<html><body>${header('me', false)}${sidebar}</body></html>`, 'me')).toBe(false)
    expect(parseSupporter(`<html><body>${header('me', false)}${header('other', true)}</body></html>`, 'me')).toBe(false)
    expect(parseSupporter('<html><body></body></html>', 'me')).toBe(false)
  })
})

