// アプリのキャッチコピー（画面・index.html・マニフェスト・README で同じ言葉を使う）
// 画面では句の切れ目でだけ折り返すので、2つの句に分けて持つ
export const TAGLINE_PHRASES = ['あなたの「好き」と、', '次の「好き」をつなぐ。'] as const // i18n-ok: 日本語のキャッチコピーの正本（英語は下の TAGLINE_PHRASES_EN）
export const TAGLINE = TAGLINE_PHRASES.join('')
// 英語の画面のキャッチコピー（いまはログイン前の最初の画面だけ）
// 句の切れ目で折り返す。1行に収まるときは、句のあいだに空白を入れる（Welcome.tsx）
export const TAGLINE_PHRASES_EN = ['Where your passions meet', 'your next spark'] as const
