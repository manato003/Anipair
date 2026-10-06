import type { ViewerStats } from '../../lib/annict'
import { compareSeasons, nextSeason, parseSlug, SEASON_NAMES, seasonNameLabel, seasonOf, toSlug, type Season, type SeasonName } from '../../lib/season'

// 称号の一覧と、その条件の判定。方針は docs/concept.md「進み具合と称号」。
// 数えるのは「答えた数」（網羅）で、評価の数では与えない。見た作品の数は見える系列にする（2026-10-06 利用者の決定）。
// 隠し称号は Annict での積み重ね（Anipair の中の連打では増えない数）から与える。
// 名前を変えるときはここだけ直せばよい（id は保存に使うので変えない）。
// 名前は数字をそのまま書かず、少し考えると「なるほど」となる元ネタを仕込む（2026-10-06 利用者の希望。例: 100クール＝四半世紀、10年＝一昔）

// クールの人気作のうち、答えた数（Annict に記録があるか「見てない」にした作品）
export interface Coverage {
  answered: number
  total: number
}

// Anipair の中での出来事（Annict からは計算できない。端末に控える）
export interface Feats {
  // 深夜2〜4時に答えた
  lateNight?: string
  // 1回でクールを大きく進めて踏破した
  oneNightCastle?: string
  // 朝5〜7時に答えた
  earlyMorning?: string
  // 元日に答えた
  newYear?: string
}

export interface Facts {
  stats: ViewerStats | null
  // 見た作品（WATCHED）の放送年
  watchedYears: readonly number[]
  // クールごとの答えた数（slug ごと）。読めたクールだけ
  coverage: ReadonlyMap<string, Coverage>
  feats: Feats
  now: Date
}

export type TitleGroup = 'season' | 'watched' | 'year' | 'decade' | 'hidden' | 'special'

// レア度。名札の色と装飾が変わる（styles/achievements.css の .plate--*）。並びは低い順。
// 色はゲームのレア度とランクの決まりに寄せた（原神・鳴潮の星の色、Valorant・Apex・LoL のランクの色）
// origin は特別な称号（Annict を創った人だけ）専用
export const RARITIES = ['bronze', 'silver', 'gold', 'amethyst', 'crimson', 'radiant', 'origin'] as const
export type Rarity = (typeof RARITIES)[number]

export interface Title {
  id: string
  name: string
  // 条件の説明。隠し称号は解放するまで見せない
  condition: string
  group: TitleGroup
  rarity: Rarity
  hidden: boolean
  unlocked: boolean
  // 進み具合（数で見せられるものだけ）
  progress: { value: number; goal: number; unit: string } | null
}

const isFull = (c: Coverage) => c.total > 0 && c.answered >= c.total

// クールの踏破の数で与える称号（見える称号）
const SEASON_TITLES: readonly { id: string; name: string; goal: number; rarity: Rarity; half?: boolean }[] = [
  // 中天＝空の真ん中（半分）
  { id: 'season-half-1', name: '中天に至りし者', goal: 1, rarity: 'bronze', half: true },
  { id: 'season-full-1', name: '初めの頂を踏みし者', goal: 1, rarity: 'bronze' },
  // 4クール＝1年
  { id: 'season-full-4', name: '暦を一巡りせし者', goal: 4, rarity: 'silver' },
  // 12クール＝3年
  { id: 'season-full-12', name: '三巡りの暦守', goal: 12, rarity: 'gold' },
  { id: 'season-full-40', name: '時を喰らう者', goal: 40, rarity: 'amethyst' },
  // 100クール＝25年
  { id: 'season-full-100', name: '四半世紀の覇王', goal: 100, rarity: 'radiant' },
]
// 見た作品（Annict の WATCHED）の本数で与える称号（見える称号。進み具合を出す）。
// 100・500・1,000本は、もとは隠し称号だったもの（id はそのまま。解放の記録を引き継ぐ）。
// 段の目安: 長年 Annict を使っている人でも、見た作品は数百本ほど。最高位は1,000本（長く深く見てきた人だけが届く）
const WATCHED_TITLES: readonly { id: string; name: string; goal: number; rarity: Rarity }[] = [
  // 十人十色: 10本＝10通りの色
  { id: 'watched-10', name: '十人十色を知る者', goal: 10, rarity: 'bronze' },
  // 半百＝50
  { id: 'watched-50', name: '半百の語り部', goal: 50, rarity: 'bronze' },
  // 百物語（百の怪談を語る会）
  { id: 'hidden-watched-100', name: '百物語を語り終えし者', goal: 100, rarity: 'silver' },
  // 1日1本で1年
  { id: 'watched-365', name: '一年分の夜を越えし者', goal: 365, rarity: 'gold' },
  { id: 'hidden-watched-500', name: '五百羅漢を従えし者', goal: 500, rarity: 'amethyst' },
  // スロットの大当たり
  { id: 'watched-777', name: '大当たりを引き当てし者', goal: 777, rarity: 'crimson' },
  { id: 'hidden-watched-1k', name: '千界の旅人', goal: 1000, rarity: 'radiant' },
]
// 年の称号と年代の称号のレア度
const YEAR_RARITY: Rarity = 'silver'
const DECADE_RARITY: Rarity = 'gold'

// 同じ季節のクールを、この数だけ踏破した
const SAME_SEASON_GOAL = 5
const SEASON_NAME_TITLES: Record<SeasonName, string> = {
  winter: '氷雪の観測者',
  spring: '桜花の観測者',
  summer: '炎陽の観測者',
  autumn: '紅葉の観測者',
}
// 続けて踏破したクールの数
const STREAK_GOAL = 8
// これより前の年のクールを踏破した
const OLD_SEASON_BEFORE = 1990
// 4クールすべて踏破した年の数
const YEAR_COUNT_TITLES: readonly { id: string; name: string; goal: number; rarity: Rarity }[] = [
  // 石の上にも三年
  { id: 'years-3', name: '冷たき石を温めし者', goal: 3, rarity: 'gold' },
  // 十年一昔
  { id: 'years-10', name: '一昔を統べる者', goal: 10, rarity: 'radiant' },
]
// 三代の証人: この年代のそれぞれで、人気作の半分に答えた
const THREE_ERAS = [2000, 2010, 2020] as const

// 年代の網羅（その年代のクールの人気作のうち、答えた割合）
const DECADE_GOAL = 0.8
// 年代の名前は、その時代のアニメを象徴するもので（ロボットアニメの黎明、OVA と VHS、セル画の終わり、深夜アニメの広がり、BD の売上の時代、配信の時代）
const DECADES: readonly { from: number; name: string }[] = [
  { from: 1970, name: 'ロボットの夜明けを知る者' },
  { from: 1980, name: 'ビデオデッキの守り人' },
  { from: 1990, name: 'セル画の最後の目撃者' },
  { from: 2000, name: '深夜枠の開拓者' },
  { from: 2010, name: '円盤の時代の語り部' },
  { from: 2020, name: '配信の海を渡る者' },
]

// 隠し称号。条件は解放するまで見せない
const HIDDEN: readonly { id: string; name: string; condition: string; rarity: Rarity; test: (f: Facts) => boolean }[] = [
  { id: 'hidden-dawn', name: '黎明より記す者', condition: '2016年までに Annict に登録した', rarity: 'gold', test: (f) => !!f.stats && new Date(f.stats.createdAt).getFullYear() <= 2016 },
  { id: 'hidden-veteran', name: '歴戦の観測者', condition: 'Annict に登録して5年が経った', rarity: 'silver', test: (f) => !!f.stats && yearsBetween(new Date(f.stats.createdAt), f.now) >= 5 },
  { id: 'hidden-records-1k', name: '千夜の語り部', condition: 'Annict でエピソードを1,000話記録した', rarity: 'gold', test: (f) => (f.stats?.recordsCount ?? 0) >= 1000 },
  { id: 'hidden-records-10k', name: '万象の観測者', condition: 'Annict でエピソードを10,000話記録した', rarity: 'radiant', test: (f) => (f.stats?.recordsCount ?? 0) >= 10000 },
  { id: 'hidden-showa', name: '昭和を識る者', condition: '1988年以前の作品を見た', rarity: 'gold', test: (f) => f.watchedYears.some((y) => y <= 1988) },
  { id: 'hidden-decades', name: '時空を越えし者', condition: '5つ以上の年代の作品を見た', rarity: 'amethyst', test: (f) => new Set(f.watchedYears.map((y) => Math.floor(y / 10))).size >= 5 },
  { id: 'hidden-wanna', name: '積みの魔王', condition: '見たい作品が300本を超えた', rarity: 'crimson', test: (f) => (f.stats?.wannaWatchCount ?? 0) >= 300 },
  { id: 'hidden-cut', name: '断ち切る者', condition: '視聴中断した作品が50本を超えた', rarity: 'crimson', test: (f) => (f.stats ? f.stats.stopWatchingCount + f.stats.onHoldCount : 0) >= 50 },
  { id: 'hidden-guide', name: '導く者', condition: 'Annict のフォロワーが100人を超えた', rarity: 'amethyst', test: (f) => (f.stats?.followersCount ?? 0) >= 100 },
  { id: 'hidden-midnight', name: '丑三つ時の観測者', condition: '深夜2時から4時のあいだに記録した', rarity: 'crimson', test: (f) => !!f.feats.lateNight },
  { id: 'hidden-castle', name: '一夜城', condition: '一度に20本以上答えて、クールを踏破した', rarity: 'gold', test: (f) => !!f.feats.oneNightCastle },
  { id: 'hidden-wanna-1k', name: '積み山脈の主', condition: '見たい作品が1,000本を超えた', rarity: 'crimson', test: (f) => (f.stats?.wannaWatchCount ?? 0) >= 1000 },
  { id: 'hidden-watching', name: '並行世界の住人', condition: '見てる作品が20本を超えた', rarity: 'crimson', test: (f) => (f.stats?.watchingCount ?? 0) >= 20 },
  { id: 'hidden-decade-friend', name: '十年来の盟友', condition: 'Annict に登録して10年が経った', rarity: 'gold', test: (f) => !!f.stats && yearsBetween(new Date(f.stats.createdAt), f.now) >= 10 },
  { id: 'hidden-genesis', name: '創世記の民', condition: '2015年までに Annict に登録した', rarity: 'amethyst', test: (f) => !!f.stats && new Date(f.stats.createdAt).getFullYear() <= 2015 },
  { id: 'hidden-stars', name: '星を導く者', condition: 'Annict のフォロワーが1,000人を超えた', rarity: 'radiant', test: (f) => (f.stats?.followersCount ?? 0) >= 1000 },
  { id: 'hidden-bonds', name: '縁を結ぶ者', condition: 'Annict で100人をフォローした', rarity: 'silver', test: (f) => (f.stats?.followingsCount ?? 0) >= 100 },
  { id: 'hidden-dawn-era', name: '黎明期の目撃者', condition: '1979年以前の作品を見た', rarity: 'amethyst', test: (f) => f.watchedYears.some((y) => y <= 1979) },
  { id: 'hidden-all-eras', name: '時の果てまで', condition: '7つの年代の作品を見た', rarity: 'radiant', test: (f) => new Set(f.watchedYears.map((y) => Math.floor(y / 10))).size >= 7 },
  { id: 'hidden-dawn-hour', name: '暁の観測者', condition: '朝5時から7時のあいだに記録した', rarity: 'bronze', test: (f) => !!f.feats.earlyMorning },
  { id: 'hidden-new-year', name: '年越しの観測者', condition: '元日に記録した', rarity: 'silver', test: (f) => !!f.feats.newYear },
]

export const HIDDEN_COUNT = HIDDEN.length

// 特別な称号: 持てる人が決まっているもの。手に入れた人にだけ見せ、数にも伏せ字の枠にも入れない（ほかの人には取れないので）。
// Annict を創った shimbaco さんへの敬意として（2026-10-04 利用者）。ユーザー名は Annict の API が返すログイン中の本人のもの
const SPECIAL: readonly { id: string; name: string; condition: string; rarity: Rarity; test: (f: Facts) => boolean }[] = [
  { id: 'special-creator', name: '記録の世界を創りし者', condition: 'Annict を創った人だけが持つ称号', rarity: 'origin', test: (f) => f.stats?.username === 'shimbaco' },
  // Annict サポーターの称号も考えたが、サポーターかは API に無い（プロフィールページにしか出ない）ので入れない。
  // Annict は API で取れるものだけを使う（docs/concept.md の設計の原則）。編集者も外から見分ける方法が無い
]

// その年の干支（2026年＝丙午）。年の称号の名前に使う（年の数字は条件の欄に出す）
const STEMS = '甲乙丙丁戊己庚辛壬癸'
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥'
export function etoOf(year: number): string {
  const i = (((year - 4) % 60) + 60) % 60
  return STEMS[i % 10] + BRANCHES[i % 12]
}

function yearsBetween(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear()
  const beforeAnniversary = to.getMonth() < from.getMonth() || (to.getMonth() === from.getMonth() && to.getDate() < from.getDate())
  return beforeAnniversary ? years - 1 : years
}

export function evaluateTitles(f: Facts): Title[] {
  const all = [...f.coverage.values()]
  const full = all.filter(isFull).length
  const half = all.filter((c) => c.total > 0 && c.answered / c.total >= 0.5).length
  const out: Title[] = []

  for (const t of SEASON_TITLES) {
    const value = t.half ? half : full
    out.push({
      id: t.id,
      name: t.name,
      condition: t.half ? '1つのクールで、人気作の半分に答える' : t.goal === 1 ? '1つのクールを踏破する（人気作すべてに答える）' : `${t.goal}のクールを踏破する`,
      group: 'season',
      rarity: t.rarity,
      hidden: false,
      unlocked: value >= t.goal,
      progress: { value: Math.min(value, t.goal), goal: t.goal, unit: 'クール' },
    })
  }

  // 見た作品の本数（Annict の記録全体。Anipair の前に Annict で付けた分も入る）
  const watched = f.stats?.watchedCount ?? 0
  for (const t of WATCHED_TITLES) {
    out.push({
      id: t.id,
      name: t.name,
      condition: `見た作品を${t.goal.toLocaleString()}本にする`,
      group: 'watched',
      rarity: t.rarity,
      hidden: false,
      unlocked: watched >= t.goal,
      progress: f.stats ? { value: Math.min(watched, t.goal), goal: t.goal, unit: '本' } : null,
    })
  }

  // 年: その年の4クールをすべて踏破した年ごとに1つ。まだの年は、いちばん近い年を1つだけ見せる
  const years = new Map<number, number>()
  for (const [slug, c] of f.coverage) {
    if (!isFull(c)) continue
    const year = Number(slug.slice(0, 4))
    years.set(year, (years.get(year) ?? 0) + 1)
  }
  const doneYears = [...years].filter(([, n]) => n >= SEASON_NAMES.length).map(([y]) => y).sort((a, b) => b - a)
  for (const year of doneYears) {
    out.push({ id: `year-${year}`, name: `${etoOf(year)}を統べる者`, condition: `${year}年の4クールをすべて踏破する`, group: 'year', rarity: YEAR_RARITY, hidden: false, unlocked: true, progress: null })
  }
  const nearest = [...years].filter(([, n]) => n < SEASON_NAMES.length).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  if (nearest) {
    const [year, n] = nearest
    out.push({
      id: `year-${year}`,
      name: `${etoOf(year)}を統べる者`,
      condition: `${year}年の4クールをすべて踏破する`,
      group: 'year',
      rarity: YEAR_RARITY,
      hidden: false,
      unlocked: false,
      progress: { value: n, goal: SEASON_NAMES.length, unit: 'クール' },
    })
  }

  // 踏破したクール（古い順）
  const fullSeasons = [...f.coverage]
    .filter(([, c]) => isFull(c))
    .map(([slug]) => parseSlug(slug))
    .filter((x): x is Season => x !== null)
    .sort(compareSeasons)

  // 季節: 同じ季節のクールを5つ踏破
  for (const name of SEASON_NAMES) {
    const value = fullSeasons.filter((x) => x.name === name).length
    out.push({
      id: `season-name-${name}`,
      name: SEASON_NAME_TITLES[name],
      condition: `${seasonNameLabel(name)}のクールを${SAME_SEASON_GOAL}つ踏破する`,
      group: 'season',
      rarity: 'silver',
      hidden: false,
      unlocked: value >= SAME_SEASON_GOAL,
      progress: { value: Math.min(value, SAME_SEASON_GOAL), goal: SAME_SEASON_GOAL, unit: 'クール' },
    })
  }

  // 今のクールを踏破
  const current = f.coverage.get(toSlug(seasonOf(f.now)))
  out.push({
    id: 'season-current',
    // 今期＝最前線
    name: '最前線の観測者',
    condition: '今のクールを踏破する',
    group: 'season',
    rarity: 'silver',
    hidden: false,
    unlocked: !!current && isFull(current),
    progress: current ? { value: Math.min(current.answered, current.total), goal: current.total, unit: '本' } : null,
  })

  // 続けて踏破したクールの、いちばん長い並び
  let streak = 0
  let run = 0
  for (let i = 0; i < fullSeasons.length; i++) {
    run = i > 0 && compareSeasons(nextSeason(fullSeasons[i - 1]), fullSeasons[i]) === 0 ? run + 1 : 1
    streak = Math.max(streak, run)
  }
  out.push({
    id: 'season-streak-8',
    // 8クール続けて＝2年間眠らずに見張る
    name: '二年の不寝番',
    condition: `${STREAK_GOAL}つ続けてクールを踏破する`,
    group: 'season',
    rarity: 'gold',
    hidden: false,
    unlocked: streak >= STREAK_GOAL,
    progress: { value: Math.min(streak, STREAK_GOAL), goal: STREAK_GOAL, unit: 'クール' },
  })

  // 古いクールを踏破
  out.push({
    id: 'season-old',
    // 1989年まで昭和
    name: '昭和の残響を聴く者',
    condition: `${OLD_SEASON_BEFORE}年より前のクールを踏破する`,
    group: 'season',
    rarity: 'amethyst',
    hidden: false,
    unlocked: fullSeasons.some((x) => x.year < OLD_SEASON_BEFORE),
    progress: null,
  })

  // 4クールすべて踏破した年の数
  for (const t of YEAR_COUNT_TITLES) {
    out.push({
      id: t.id,
      name: t.name,
      condition: `4クールすべてを踏破した年を${t.goal}つにする`,
      group: 'year',
      rarity: t.rarity,
      hidden: false,
      unlocked: doneYears.length >= t.goal,
      progress: { value: Math.min(doneYears.length, t.goal), goal: t.goal, unit: '年' },
    })
  }

  // 年代: その年代のクールの人気作のうち、答えた割合
  for (const d of DECADES) {
    const ratio = decadeRatio(f.coverage, d.from)
    const pct = Math.floor(ratio * 100)
    const goal = Math.round(DECADE_GOAL * 100)
    out.push({
      id: `decade-${d.from}`,
      name: d.name,
      condition: `${d.from}年代のクールの人気作の${goal}%に答える`,
      group: 'decade',
      rarity: DECADE_RARITY,
      hidden: false,
      unlocked: ratio >= DECADE_GOAL,
      progress: { value: Math.min(pct, goal), goal, unit: '%' },
    })
  }

  // 三代の証人: ゼロ年代・テン年代・二〇年代のそれぞれで、人気作の半分に答えた
  const halfEras = THREE_ERAS.filter((from) => decadeRatio(f.coverage, from) >= 0.5).length
  out.push({
    id: 'decade-three-eras',
    // ゼロ年代から二〇年代＝平成から令和
    name: '二つの元号を渡りし者',
    condition: 'ゼロ年代・テン年代・二〇年代のそれぞれで、人気作の半分に答える',
    group: 'decade',
    rarity: 'amethyst',
    hidden: false,
    unlocked: halfEras >= THREE_ERAS.length,
    progress: { value: halfEras, goal: THREE_ERAS.length, unit: '年代' },
  })

  for (const sp of SPECIAL) {
    out.push({ id: sp.id, name: sp.name, condition: sp.condition, group: 'special', rarity: sp.rarity, hidden: true, unlocked: sp.test(f), progress: null })
  }
  for (const h of HIDDEN) {
    out.push({ id: h.id, name: h.name, condition: h.condition, group: 'hidden', rarity: h.rarity, hidden: true, unlocked: h.test(f), progress: null })
  }
  return out
}

// クールの人気作の ID と、答えた作品の ID から、クールごとの答えた数を出す
// その年代のクールの人気作のうち、答えた割合（読めたクールだけで数える）
function decadeRatio(coverage: ReadonlyMap<string, Coverage>, from: number): number {
  let answered = 0
  let total = 0
  for (let year = from; year < from + 10; year++) {
    for (const name of SEASON_NAMES) {
      const c = coverage.get(toSlug({ year, name }))
      if (!c) continue
      answered += c.answered
      total += c.total
    }
  }
  return total > 0 ? answered / total : 0
}

// レア度の低い順に並べる（覚醒で、いちばん良いものを最後に見せる）
export function byRarity(a: Title, b: Title): number {
  return RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)
}

export function coverageOf(tops: ReadonlyMap<string, readonly number[]>, answered: ReadonlySet<number>): Map<string, Coverage> {
  const out = new Map<string, Coverage>()
  for (const [slug, ids] of tops) {
    if (ids.length === 0) continue
    out.set(slug, { answered: ids.filter((id) => answered.has(id)).length, total: ids.length })
  }
  return out
}
