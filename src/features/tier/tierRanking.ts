import { withRanked, type TierTable } from './tierList'

// Tier表の段の中の順番を、2つずつ比べて決める（TierCompare.tsx の純粋な部分。Windows では名前の大小を区別しないので、部品と別の名前にしている）。
// 二分挿入: 比べ終えた作品の並び（ranked）に、まだの作品を1本ずつ、残りの幅の真ん中の作品と比べて位置を絞って入れる。
// 1本入れるたびに表へ書くので、途中でやめても比べ終えた分は段の前に残り、次に開くと続きから比べる。
// 自分で並べた表の微調整にも使えるよう、印を付けてもらう代わりに、各作品の最初の問いは1つ前に入れた作品と比べて今の並びを確かめる（2026-11-02 利用者）。
// 20本の試算: 並べ済み 54→19回、±2本のゆれ 56→40回、ばらばら 62→63回

export interface CompareState {
  // 比べて決めた並び（上から）
  ranked: number[]
  // まだ比べていない作品（段の元の順）。先頭がいま比べている作品
  rest: number[]
  // 先頭の作品が入る位置の幅（ranked の lo 番目から hi 番目の間）
  lo: number
  hi: number
  // 1つ前に入れた作品。先頭の作品の最初の問いは、これと比べる
  anchor: number | null
  // 入れた作品（古い順）が、anchor のすぐ下から外れたか
  missed: boolean[]
  // 答えた回数と、それで絞れた分（二分だけなら何回かかったかに当たる量）。残りの回数の見積もりに使う
  asked: number
  narrowed: number
}

export interface ComparePair {
  // 入れる位置を探している作品
  candidate: number
  // 比べる相手（比べ終えた作品）
  against: number
}

// 直近の RECENT 本のうち GIVE_UP 本が外れたら、今の並びは当てにならないので真ん中から聞く（当たりだしたら戻す）
const RECENT = 4
const GIVE_UP = 3
// anchor のすぐ下からこの本数までのずれは、当たりと数える
const NEAR = 1
// 見積もりで、答える前から二分どおりにかかったものとして数えておく回数
const PRIOR = 4

// visible は画面に出ている段の並び（範囲から外れた作品は比べない）。ranked は段の「比べて決めた作品」の印。
// 自分で並べ直した位置も、比べて決めた作品どうしの順番として扱う（visible の順のまま）
export function startCompare(visible: readonly number[], ranked: readonly number[]): CompareState {
  const done = visible.filter((id) => ranked.includes(id))
  const rest = visible.filter((id) => !ranked.includes(id))
  // 1本も比べていなければ、最初の作品を並びの始まりにする
  if (done.length === 0 && rest.length > 0) return { ranked: [rest[0]], rest: rest.slice(1), lo: 0, hi: 1, anchor: rest[0], missed: [], asked: 0, narrowed: 0 }
  return { ranked: done, rest, lo: 0, hi: done.length, anchor: done.at(-1) ?? null, missed: [], asked: 0, narrowed: 0 }
}

// 幅が n のときに二分で残っている回数
const binary = (n: number) => Math.log2(n + 1)
const isFirstAsk = (s: CompareState) => s.lo === 0 && s.hi === s.ranked.length
const trustsOrder = (s: CompareState) => s.missed.slice(-RECENT).filter(Boolean).length < GIVE_UP

// いま比べる相手の位置
function pivot(s: CompareState): number {
  const at = isFirstAsk(s) && trustsOrder(s) ? s.ranked.indexOf(s.anchor ?? -1) : -1
  return at >= 0 ? at : Math.floor((s.lo + s.hi) / 2)
}

export function nextPair(s: CompareState): ComparePair | null {
  if (s.rest.length === 0) return null
  return { candidate: s.rest[0], against: s.ranked[pivot(s)] }
}

// 答える。higher は、いま比べている作品（candidate）を上にしたか。位置が決まったら並びに入れて、次の作品へ進む
export function answerCompare(s: CompareState, higher: boolean): CompareState {
  if (s.rest.length === 0) return s
  const at = pivot(s)
  const lo = higher ? s.lo : at + 1
  const hi = higher ? at : s.hi
  const asked = s.asked + 1
  const narrowed = s.narrowed + binary(s.hi - s.lo) - binary(hi - lo)
  if (lo < hi) return { ...s, lo, hi, asked, narrowed }
  const ranked = [...s.ranked]
  ranked.splice(lo, 0, s.rest[0])
  const missed = [...s.missed, Math.abs(lo - (s.ranked.indexOf(s.anchor ?? -1) + 1)) > NEAR]
  return { ranked, rest: s.rest.slice(1), lo: 0, hi: ranked.length, anchor: s.rest[0], missed, asked, narrowed }
}

// 残りの比べる回数の見積もり。今の並びがどれだけ合っているかで大きく変わるので、最大ではなく、
// 二分で残っている回数に、ここまで二分と比べて何倍かかったかを掛ける（並びが合っていれば、答えるほど減っていく）
export function aboutLeft(s: CompareState): number {
  if (s.rest.length === 0) return 0
  let total = binary(s.hi - s.lo)
  for (let k = 1; k < s.rest.length; k++) total += binary(s.ranked.length + k)
  return Math.max(1, Math.round((total * (s.asked + PRIOR)) / (s.narrowed + PRIOR)))
}

// 比べた結果を段に書く。比べ終えた作品を前に、まだの作品をその後ろに元の順で、画面に出ていない作品は最後に置く
export function applyCompare(table: TierTable, index: number, s: CompareState, now: Date = new Date()): TierTable {
  const tier = table.tiers[index]
  if (!tier) return table
  const ranked = s.ranked.filter((id) => tier.items.includes(id))
  const rest = s.rest.filter((id) => tier.items.includes(id) && !ranked.includes(id))
  const others = tier.items.filter((id) => !ranked.includes(id) && !rest.includes(id))
  const tiers = table.tiers.map((t, i) => (i === index ? withRanked({ ...t, items: [...ranked, ...rest, ...others] }, ranked) : t))
  return { ...table, tiers, updatedAt: now.toISOString() }
}

// 「最初から比べ直す」。並びはそのままで、比べて決めた印だけを外す
export function resetCompare(table: TierTable, index: number, now: Date = new Date()): TierTable {
  const tier = table.tiers[index]
  if (!tier?.ranked) return table
  const tiers = table.tiers.map((t, i) => (i === index ? withRanked(t, []) : t))
  return { ...table, tiers, updatedAt: now.toISOString() }
}
