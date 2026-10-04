// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { clip, firstParagraph, parseSynopsis, pickSynopsisSection, wikiTitleOf } from './wikipedia'

describe('wikiTitleOf', () => {
  it('reads the article title from a Japanese Wikipedia URL (encoded or not, desktop or mobile)', () => {
    expect(wikiTitleOf('https://ja.wikipedia.org/wiki/%E8%91%AC%E9%80%81%E3%81%AE%E3%83%95%E3%83%AA%E3%83%BC%E3%83%AC%E3%83%B3')).toBe('葬送のフリーレン')
    expect(wikiTitleOf('http://ja.wikipedia.org/wiki/STEINS;GATE_(アニメ)')).toBe('STEINS;GATE (アニメ)')
    expect(wikiTitleOf('https://ja.m.wikipedia.org/wiki/蟲師')).toBe('蟲師')
  })

  it('ignores other languages, other sites and broken values', () => {
    expect(wikiTitleOf('https://en.wikipedia.org/wiki/Frieren')).toBeNull()
    expect(wikiTitleOf('https://example.com/wiki/a')).toBeNull()
    expect(wikiTitleOf('not a url')).toBeNull()
    expect(wikiTitleOf(null)).toBeNull()
    expect(wikiTitleOf('https://ja.wikipedia.org/wiki/%E0%A4%A')).toBeNull()
  })
})

describe('pickSynopsisSection', () => {
  const sec = (line: string, index: string) => ({ line, index, anchor: line })
  it('picks the first section named like a synopsis', () => {
    expect(pickSynopsisSection([sec('概要', '1'), sec('あらすじ', '2'), sec('ストーリー', '5')])).toEqual({ index: '2', anchor: 'あらすじ' })
    expect(pickSynopsisSection([sec('作品', '1'), sec('<i>ストーリー</i>', '3')])).toEqual({ index: '3', anchor: '<i>ストーリー</i>' })
  })

  it('gives nothing when there is no synopsis section (no guessing from other sections)', () => {
    expect(pickSynopsisSection([sec('概要', '1'), sec('登場人物', '2'), sec('あらすじと設定の違い', '3')])).toBeNull()
  })
})

describe('firstParagraph', () => {
  it('takes only the first paragraph, without footnote marks', () => {
    const html = `<div class="mw-parser-output"><div class="mw-heading"><h2>あらすじ</h2></div>
      <p>魔王を倒した勇者一行は、王都に凱旋した。<sup class="reference">[1]</sup>エルフのフリーレンにとって、その旅は短いものだった。</p>
      <p>それから50年後、ヒンメルは亡くなる。</p></div>`
    expect(firstParagraph(html)).toBe('魔王を倒した勇者一行は、王都に凱旋した。エルフのフリーレンにとって、その旅は短いものだった。')
  })

  it('skips short notes and hatnotes, and gives nothing when there is no real paragraph', () => {
    const html = '<div class="hatnote">「○○」とは異なります。</div><p>（未記入）</p><p>高校2年生の主人公は、図書館でバニーガール姿の先輩を目撃する。周りの誰にも彼女が見えていない。</p>'
    expect(firstParagraph(html)).toBe('高校2年生の主人公は、図書館でバニーガール姿の先輩を目撃する。周りの誰にも彼女が見えていない。')
    expect(firstParagraph('<p>短い</p><table><tr><td>表の中の長い文章がここにあるけれど、これは段落ではないので使わない。</td></tr></table>')).toBeNull()
  })
})

describe('keeping the synopsis short and on topic', () => {
  it('skips paragraphs that describe the article instead of the story', () => {
    const html = '<p>本稿では、姫が小学4年生から5年生の時を「姫10歳編」として記述する。</p><p>漫画家の後藤可久士は、下ネタ漫画を描いていることを娘の姫に隠している。娘に知られないよう、日々を送っている。</p>'
    expect(firstParagraph(html)).toBe('漫画家の後藤可久士は、下ネタ漫画を描いていることを娘の姫に隠している。娘に知られないよう、日々を送っている。')
  })

  it('removes empty parentheses left by stripped markup', () => {
    expect(firstParagraph('<p>隣り合う東国（）と西国（ ）の間には、仮初めの平和が成り立っていた時代の物語である。</p>')).toBe('隣り合う東国と西国の間には、仮初めの平和が成り立っていた時代の物語である。')
  })

  it('cuts a long paragraph at a sentence boundary, keeping at least the first sentence', () => {
    const first = 'あ'.repeat(100) + '。'
    const second = 'い'.repeat(50) + '。'
    const third = 'う'.repeat(50) + '。'
    expect(clip(first + second + third)).toBe(first + second + '…')
    const long = 'え'.repeat(200) + '。' + 'お'.repeat(10) + '。'
    expect(clip(long)).toBe('え'.repeat(200) + '。…')
    expect(clip('短い文。')).toBe('短い文。')
  })
})

describe('parseSynopsis (the whole section for 続きを読む)', () => {
  it('keeps the subheadings and paragraphs in order, without the article notes, and the clipped lead', () => {
    const html = `<div class="mw-heading mw-heading2"><h2>あらすじ</h2></div>
      <p>本稿では、各巻のあらすじを記述する。</p>
      <div class="mw-heading mw-heading3"><h3>第1巻</h3></div>
      <p>高校2年生の主人公は、図書館でバニーガール姿の先輩を目撃する。<sup class="reference">[2]</sup></p>
      <div class="mw-heading mw-heading3"><h3>第2巻</h3></div>
      <p>夏休み、後輩の少女が同じ1日を繰り返していることに気づく。</p>`
    expect(parseSynopsis(html)).toEqual({
      text: '高校2年生の主人公は、図書館でバニーガール姿の先輩を目撃する。',
      blocks: [
        { heading: true, text: '第1巻' },
        { heading: false, text: '高校2年生の主人公は、図書館でバニーガール姿の先輩を目撃する。' },
        { heading: true, text: '第2巻' },
        { heading: false, text: '夏休み、後輩の少女が同じ1日を繰り返していることに気づく。' },
      ],
    })
  })

  it('gives nothing when there is no real paragraph', () => {
    expect(parseSynopsis('<h3>第1巻</h3><p>短い</p>')).toBeNull()
  })
})

