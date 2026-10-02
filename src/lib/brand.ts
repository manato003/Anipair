// アプリのキャッチコピー（画面・index.html・マニフェスト・README で同じ言葉を使う）
// 画面では句の切れ目でだけ折り返すので、2つの句に分けて持つ
export const TAGLINE_PHRASES = ['あなたの「好き」と、', '次の「好き」をつなぐ。'] as const
export const TAGLINE = TAGLINE_PHRASES.join('')
