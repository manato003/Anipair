import { searchWorksByTitle, type WorkRef } from '../../lib/annict'
import type { Media } from '../../lib/shikimori'

// 候補（Shikimori の作品）から Annict の作品を特定する。Annict は MyAnimeList の ID で検索できないので、
// 題名で検索して ID で照合する（ID で照合するので、引く語を増やしても別の作品は採らない）。
// Annict の検索は日本語の題名への部分一致だけ（英語名・ローマ字は、作品名が英字のときしか当たらない）。
// Shikimori の日本語名は Annict と表記が違うことが多い（読みがなの括弧〈ヒロイン〉・[新編] の有無・★と☆・ⅡとII・カタカナと英字）ので、
// まずそのまま引き、外れたら題名を区切りで切った「かけら」を長い順に引く。
// 実測（2026-10-07、Annict の人気順で MAL の ID がある作品）: 上位600作品で、元の手順（AniList のときに決めた）の外れ 49件 → この手順で 0件。
// 規則を決めるのに使っていない 600〜900番目では 1件（名探偵コナン漆黒の追跡者(チェイサー) / Annict は「名探偵コナン 漆黒の追跡者」）。当たるまでの検索は平均1.35回

// \s は全角スペースにも当たる
const SEPARATORS = /[\s\-―:：!！?？~〜「『(（]/
// 読みがなの括弧（冴えない彼女〈ヒロイン〉の育てかた・超電磁砲[レールガン]T・落第騎士の英雄譚《キャバルリィ》）
const RUBY = /[〈<＜《[［][^〉>＞》\]］]{1,20}[〉>＞》\]］]/g
// かけらに切る区切り。「劇場版」「映画」は Annict に無いことが多い（劇場版メイドインアビス / メイドインアビス 深き魂の黎明）
const PIECE_SEPARATORS = /[\s\-―－:：;；!！?？~〜「」『』()（）[\]［］〈〉<>＜＞《》【】/／・.,、。☆★♪♭√°゜'’"“”&＆]+|新劇場版|劇場版|映画/
// 日本語と英字・数字の境目でも切る（ドクターストーン STONE WARS、だろうかII）。後読み（?<=）は iOS 16.4 より前の Safari で構文エラーになるので、連なりで取る
const SCRIPT_RUNS = /[ぁ-んァ-ヶ一-龠々ー]+|[^ぁ-んァ-ヶ一-龠々ー]+/g
// 漢字と仮名だけなら2文字でも引く（銀魂° / 銀魂゜）。英字の2文字（IS）は当たりすぎる
const JAPANESE_ONLY = /^[ぁ-んァ-ヶ一-龠々ー]+$/
// 1作品で引く回数の上限（外れる作品で、検索を際限なく重ねない）
const MAX_VARIANTS = 12

function pieces(title: string): string[] {
  const out: string[] = []
  // 読みがなの括弧は、外した題名と、括弧を区切りとして中身も残した題名の両方から切る（IS〈インフィニット・ストラトス〉は中身が本題）
  for (const s of [title.replace(RUBY, ' '), title]) {
    for (const p of s.split(PIECE_SEPARATORS)) {
      for (const q of p.match(SCRIPT_RUNS) ?? []) {
        if ((q.length >= 3 || (q.length === 2 && JAPANESE_ONLY.test(q))) && !out.includes(q)) out.push(q)
      }
    }
  }
  return out.sort((a, b) => b.length - a.length)
}

// 英語名・ローマ字はコロンの前だけ、空白を詰めた形も（Dr. Stone → Dr.Stone で「Dr.STONE」に当たる。大文字小文字は区別されない）。
// 最後に、最初の語だけも（Persona 4 The Animation → Persona で「Persona4 the ANIMATION」に当たる）
function latinHeads(title: string | null): string[] {
  const head = title?.split(/\s*[:：]\s|\s-\s/)[0].trim()
  if (!head) return []
  const word = head.split(/\s+/)[0]
  return [head.replace(/\s+/g, ''), head, ...(/^[A-Za-z]{4,}$/.test(word) ? [word] : [])]
}

export function titleVariants(title: Media['title']): string[] {
  const out: string[] = []
  const add = (s: string | null | undefined) => {
    const v = s?.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  const native = title.native ?? ''
  const nfkc = native.normalize('NFKC')
  // 大半はこの3つで当たる
  add(native)
  add(nfkc)
  const head = nfkc.split(SEPARATORS)[0]
  if (head.length >= 3) add(head)
  add(native.replace(/★/g, '☆'))
  add(native.replace(RUBY, ''))
  for (const p of [...pieces(native), ...pieces(nfkc)].sort((a, b) => b.length - a.length)) add(p)
  for (const t of [title.english, title.romaji]) for (const h of latinHeads(t)) add(h)
  return out.slice(0, MAX_VARIANTS)
}

export async function resolveAnnictWork(token: string, media: Pick<Media, 'idMal' | 'title'>): Promise<WorkRef | null> {
  const mal = String(media.idMal)
  for (const v of titleVariants(media.title)) {
    const hit = (await searchWorksByTitle(token, v)).find((w) => w.malAnimeId === mal)
    if (hit) return hit
  }
  return null
}
