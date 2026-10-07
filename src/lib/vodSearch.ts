// 配信サービスの検索ページへのリンク。題名を各サービスの検索に入れるだけで、配信しているかは確かめない（画面にもそう書く）。
// 日本のアニメの配信状況は、Annict の API に無く（2026-07 のフォーラムでの管理者の回答）、ほかにも個人が正当に使える取り先が無い。
// 作品ページを読み取るのではなく、利用者が1タップで確かめられる入り口だけを置く（2026-10-07。並びは作者が選んだ順）。
// URL は実ブラウザで「葬送のフリーレン」を引いて確かめた（2026-10-07）。Netflix はログインしていなければ、ログインを経て検索に戻る。
// ニコニコはアニメの総合サイト（Nアニメ）の検索が無いので、ニコニコ動画の検索（公式チャンネルと dアニメストア ニコニコ支店も入る）
const SERVICES: readonly { name: string; url: (q: string) => string }[] = [
  { name: 'Netflix', url: (q) => `https://www.netflix.com/search?q=${q}` },
  { name: 'U-NEXT', url: (q) => `https://video.unext.jp/freeword?query=${q}` },
  { name: 'Prime Video', url: (q) => `https://www.amazon.co.jp/gp/video/search?phrase=${q}` },
  { name: 'ABEMA', url: (q) => `https://abema.tv/search?q=${q}` },
  { name: 'dアニメストア', url: (q) => `https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey=${q}` },
  { name: 'ニコニコ', url: (q) => `https://www.nicovideo.jp/search/${q}` },
]

export function vodSearchLinks(title: string): { name: string; href: string }[] {
  const q = encodeURIComponent(title.trim())
  if (!q) return []
  return SERVICES.map((s) => ({ name: s.name, href: s.url(q) }))
}
