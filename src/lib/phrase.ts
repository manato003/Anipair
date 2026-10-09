// 日本語を語の途中で折らない（「アクシ／ョン」「夢を／見ない」と折れていた。2026-10-07）。
// ブラウザの Intl.Segmenter で語に分け、漢字・カタカナ・英数字・開き括弧で始まる語の前にだけ改行の機会（wbr）を置く。
// ひらがなで始まる語（助詞・送り仮名など）は前の語につなげる（「夢を｜見ない」）。iPhone の Safari でも効く（word-break: auto-phrase は Chrome だけ）。
// 語の中では折らない（keep-all）。1語が行に収まらないときだけ、どこででも折る（overflow-wrap: anywhere。はみ出さない）
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('ja', { granularity: 'word' }) : null
const BREAK_BEFORE = /^[\p{Script=Han}\p{Script=Katakana}A-Za-z0-9０-９Ａ-Ｚａ-ｚ「『（(【〈《]/u
// 直後で折らない文字: 開き括弧（『｜86 と括弧だけが行末に残る）・数字と「第」（第｜3｜期）
const NO_BREAK_AFTER = /[「『（(【〈《0-9０-９第]$/u
const HAN_END = /\p{Script=Han}$/u
const HAN_START = /^\p{Script=Han}/u
const KANA_END = /[\p{Script=Katakana}ー]$/u
const KANA_START = /^[\p{Script=Katakana}ー]/u

export function phraseChunks(text: string): string[] {
  if (!segmenter) return [text]
  const chunks: string[] = []
  for (const { segment } of segmenter.segment(text)) {
    const last = chunks.length - 1
    const prev = chunks[last] ?? ''
    // 漢字どうし・カタカナどうしは続ける（新｜世紀、ガン｜ダム と折らない。辞書が1語を分けることがある）
    const same = (HAN_END.test(prev) && HAN_START.test(segment)) || (KANA_END.test(prev) && KANA_START.test(segment))
    const breakable = last >= 0 && BREAK_BEFORE.test(segment) && !NO_BREAK_AFTER.test(prev) && !same
    if (last < 0 || breakable) chunks.push(segment)
    else chunks[last] += segment
  }
  return chunks
}
