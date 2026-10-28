import type { ViewerStats } from '../../lib/annict'
import { t, tx, type Text } from '../../lib/i18n'
import { FEAT_TITLES } from './featTitles'
import { RARITIES, type Rarity } from './rarity'
import { compareSeasons, nextSeason, parseSlug, SEASON_NAMES, seasonNameLabel, seasonOf, toSlug, type Season, type SeasonName } from '../../lib/season'

// 称号の一覧と、その条件の判定。
// 数えるのは「答えた数」（網羅）で、評価の数では与えない。見た作品の数は見える系列にする。
// 隠し称号は Annict での積み重ね（Anipair の中の連打では増えない数）から与える。
// 名前を変えるときはここだけ直せばよい（id は保存に使うので変えない）。
// 名前は数字をそのまま書かず、少し考えると「なるほど」となる元ネタを仕込む（例: 100クール＝四半世紀、10年＝一昔）
// 英語の名前は直訳でなく、元ネタの意味と短さを残して付け直す（日本語の言葉遊びは、そのままでは伝わらないので）。
// 名前と条件は { ja, en } で持ち、evaluateTitles のなかで tx() して言語を決める（import 時に t() を呼ばないため）

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

export { RARITIES, RARITY_LABEL, type Rarity } from './rarity'

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
const SEASON_TITLES: readonly { id: string; name: Text; goal: number; rarity: Rarity; half?: boolean }[] = [
  // 中天＝空の真ん中（半分）
  { id: 'season-half-1', name: { ja: '中天に至りし者', en: 'Halfway Up the Sky' }, goal: 1, rarity: 'bronze', half: true },
  { id: 'season-full-1', name: { ja: '初めの頂を踏みし者', en: 'First Summit Climber' }, goal: 1, rarity: 'bronze' },
  // 4クール＝1年
  { id: 'season-full-4', name: { ja: '暦を一巡りせし者', en: 'One Who Turned the Year' }, goal: 4, rarity: 'silver' },
  // 12クール＝3年
  { id: 'season-full-12', name: { ja: '三巡りの暦守', en: 'Keeper of Three Calendars' }, goal: 12, rarity: 'gold' },
  { id: 'season-full-40', name: { ja: '時を喰らう者', en: 'Time Devourer' }, goal: 40, rarity: 'amethyst' },
  // 100クール＝25年
  { id: 'season-full-100', name: { ja: '四半世紀の覇王', en: 'Quarter-Century Overlord' }, goal: 100, rarity: 'radiant' },
]
// 見た作品（Annict の WATCHED）の本数で与える称号（見える称号。進み具合を出す）。
// 100・500・1,000本は、もとは隠し称号だったもの（id はそのまま。解放の記録を引き継ぐ）。
// 段の目安: 長年 Annict を使っている人でも、見た作品は数百本ほど。最高位は1,000本（長く深く見てきた人だけが届く）
const WATCHED_TITLES: readonly { id: string; name: Text; goal: number; rarity: Rarity }[] = [
  // 十人十色: 10本＝10通りの色
  { id: 'watched-10', name: { ja: '十人十色を知る者', en: 'Taster of Ten Flavors' }, goal: 10, rarity: 'bronze' },
  // 半百＝50
  { id: 'watched-50', name: { ja: '半百の語り部', en: 'Fifty-Tale Storyteller' }, goal: 50, rarity: 'bronze' },
  // 百物語（百の怪談を語る会）
  { id: 'hidden-watched-100', name: { ja: '百物語を語り終えし者', en: 'Teller of the Hundredth Tale' }, goal: 100, rarity: 'silver' },
  // 1日1本で1年
  { id: 'watched-365', name: { ja: '一年分の夜を越えし者', en: 'Survivor of 365 Nights' }, goal: 365, rarity: 'gold' },
  { id: 'hidden-watched-500', name: { ja: '五百羅漢を従えし者', en: 'Lord of 500 Sages' }, goal: 500, rarity: 'amethyst' },
  // スロットの大当たり
  { id: 'watched-777', name: { ja: '大当たりを引き当てし者', en: 'Triple-Seven Jackpot' }, goal: 777, rarity: 'crimson' },
  { id: 'hidden-watched-1k', name: { ja: '千界の旅人', en: 'Traveler of 1,000 Worlds' }, goal: 1000, rarity: 'radiant' },
]
// 年の称号と年代の称号のレア度
const YEAR_RARITY: Rarity = 'silver'
const DECADE_RARITY: Rarity = 'gold'

// 同じ季節のクールを、この数だけ踏破した
const SAME_SEASON_GOAL = 5
const SEASON_NAME_TITLES: Record<SeasonName, Text> = {
  winter: { ja: '氷雪の観測者', en: 'Snow and Ice Observer' },
  spring: { ja: '桜花の観測者', en: 'Cherry Blossom Observer' },
  summer: { ja: '炎陽の観測者', en: 'Blazing Sun Observer' },
  autumn: { ja: '紅葉の観測者', en: 'Red Leaves Observer' },
}
// 続けて踏破したクールの数
const STREAK_GOAL = 8
// これより前の年のクールを踏破した
const OLD_SEASON_BEFORE = 1990
// 4クールすべて踏破した年の数
const YEAR_COUNT_TITLES: readonly { id: string; name: Text; goal: number; rarity: Rarity }[] = [
  // 石の上にも三年
  { id: 'years-3', name: { ja: '冷たき石を温めし者', en: 'Warmer of the Cold Stone' }, goal: 3, rarity: 'gold' },
  // 十年一昔
  { id: 'years-10', name: { ja: '一昔を統べる者', en: 'Ruler of a Decade' }, goal: 10, rarity: 'radiant' },
]
// 三代の証人: この年代のそれぞれで、人気作の半分に答えた
const THREE_ERAS = [2000, 2010, 2020] as const

// 年代の網羅（その年代のクールの人気作のうち、答えた割合）
const DECADE_GOAL = 0.8
// 年代の名前は、その時代のアニメを象徴するもので（ロボットアニメの黎明、OVA と VHS、セル画の終わり、深夜アニメの広がり、BD の売上の時代、配信の時代）
const DECADES: readonly { from: number; name: Text }[] = [
  { from: 1970, name: { ja: 'ロボットの夜明けを知る者', en: 'Witness of the Robot Dawn' } },
  { from: 1980, name: { ja: 'ビデオデッキの守り人', en: 'Keeper of the VCR' } },
  { from: 1990, name: { ja: 'セル画の最後の目撃者', en: 'Last Witness of Cel Animation' } },
  { from: 2000, name: { ja: '深夜枠の開拓者', en: 'Late-Night Slot Pioneer' } },
  { from: 2010, name: { ja: '円盤の時代の語り部', en: 'Storyteller of the Disc Era' } },
  { from: 2020, name: { ja: '配信の海を渡る者', en: 'Sailor of the Streaming Sea' } },
]

export { featTitle } from './featTitles'

// 隠し称号。条件は解放するまで見せない
const HIDDEN: readonly { id: string; name: Text; condition: Text; rarity: Rarity; test: (f: Facts) => boolean }[] = [
  { id: 'hidden-dawn', name: { ja: '黎明より記す者', en: 'Dawn Chronicler' }, condition: { ja: '2016年までにAnnictに登録した', en: 'Signed up for Annict in 2016 or earlier' }, rarity: 'gold', test: (f) => !!f.stats && new Date(f.stats.createdAt).getFullYear() <= 2016 },
  { id: 'hidden-veteran', name: { ja: '歴戦の観測者', en: 'Seasoned Observer' }, condition: { ja: 'Annictに登録して5年が経った', en: 'Have had an Annict account for 5 years' }, rarity: 'silver', test: (f) => !!f.stats && yearsBetween(new Date(f.stats.createdAt), f.now) >= 5 },
  { id: 'hidden-records-1k', name: { ja: '千夜の語り部', en: 'Thousand Nights Storyteller' }, condition: { ja: 'Annictでエピソードを1,000話記録した', en: 'Logged 1,000 episodes on Annict' }, rarity: 'gold', test: (f) => (f.stats?.recordsCount ?? 0) >= 1000 },
  { id: 'hidden-records-10k', name: { ja: '万象の観測者', en: 'Observer of All Things' }, condition: { ja: 'Annictでエピソードを10,000話記録した', en: 'Logged 10,000 episodes on Annict' }, rarity: 'radiant', test: (f) => (f.stats?.recordsCount ?? 0) >= 10000 },
  { id: 'hidden-showa', name: { ja: '昭和を識る者', en: 'Showa Scholar' }, condition: { ja: '1988年以前の作品を見た', en: 'Watched an anime from 1988 or earlier' }, rarity: 'gold', test: (f) => f.watchedYears.some((y) => y <= 1988) },
  { id: 'hidden-decades', name: { ja: '時空を越えし者', en: 'Spacetime Crosser' }, condition: { ja: '5つ以上の年代の作品を見た', en: 'Watched anime from 5 or more decades' }, rarity: 'amethyst', test: (f) => new Set(f.watchedYears.map((y) => Math.floor(y / 10))).size >= 5 },
  { id: 'hidden-wanna', name: { ja: '積みの魔王', en: 'Backlog Demon King' }, condition: { ja: '見たい作品が300本を超えた', en: 'Have more than 300 anime on Want to watch' }, rarity: 'crimson', test: (f) => (f.stats?.wannaWatchCount ?? 0) >= 300 },
  { id: 'hidden-cut', name: { ja: '断ち切る者', en: 'Cutter of Ties' }, condition: { ja: '視聴中断した作品が50本を超えた', en: 'Dropped more than 50 anime' }, rarity: 'crimson', test: (f) => (f.stats ? f.stats.stopWatchingCount + f.stats.onHoldCount : 0) >= 50 },
  { id: 'hidden-guide', name: { ja: '導く者', en: 'The Guide' }, condition: { ja: 'Annictのフォロワーが100人を超えた', en: 'Have more than 100 followers on Annict' }, rarity: 'amethyst', test: (f) => (f.stats?.followersCount ?? 0) >= 100 },
  { ...FEAT_TITLES.lateNight, test: (f) => !!f.feats.lateNight },
  { ...FEAT_TITLES.oneNightCastle, test: (f) => !!f.feats.oneNightCastle },
  { id: 'hidden-wanna-1k', name: { ja: '積み山脈の主', en: 'Lord of the Backlog Range' }, condition: { ja: '見たい作品が1,000本を超えた', en: 'Have more than 1,000 anime on Want to watch' }, rarity: 'crimson', test: (f) => (f.stats?.wannaWatchCount ?? 0) >= 1000 },
  { id: 'hidden-watching', name: { ja: '並行世界の住人', en: 'Parallel World Dweller' }, condition: { ja: '見てる作品が20本を超えた', en: 'Have more than 20 anime on Watching' }, rarity: 'crimson', test: (f) => (f.stats?.watchingCount ?? 0) >= 20 },
  { id: 'hidden-decade-friend', name: { ja: '十年来の盟友', en: 'Ten-Year Ally' }, condition: { ja: 'Annictに登録して10年が経った', en: 'Have had an Annict account for 10 years' }, rarity: 'gold', test: (f) => !!f.stats && yearsBetween(new Date(f.stats.createdAt), f.now) >= 10 },
  { id: 'hidden-genesis', name: { ja: '創世記の民', en: 'Child of Genesis' }, condition: { ja: '2015年までにAnnictに登録した', en: 'Signed up for Annict in 2015 or earlier' }, rarity: 'amethyst', test: (f) => !!f.stats && new Date(f.stats.createdAt).getFullYear() <= 2015 },
  { id: 'hidden-stars', name: { ja: '星を導く者', en: 'Star Guide' }, condition: { ja: 'Annictのフォロワーが1,000人を超えた', en: 'Have more than 1,000 followers on Annict' }, rarity: 'radiant', test: (f) => (f.stats?.followersCount ?? 0) >= 1000 },
  { id: 'hidden-bonds', name: { ja: '縁を結ぶ者', en: 'Bond Weaver' }, condition: { ja: 'Annictで100人をフォローした', en: 'Followed 100 people on Annict' }, rarity: 'silver', test: (f) => (f.stats?.followingsCount ?? 0) >= 100 },
  { id: 'hidden-dawn-era', name: { ja: '黎明期の目撃者', en: 'Witness of the Dawn Era' }, condition: { ja: '1979年以前の作品を見た', en: 'Watched an anime from 1979 or earlier' }, rarity: 'amethyst', test: (f) => f.watchedYears.some((y) => y <= 1979) },
  { id: 'hidden-all-eras', name: { ja: '時の果てまで', en: 'To the End of Time' }, condition: { ja: '7つの年代の作品を見た', en: 'Watched anime from 7 decades' }, rarity: 'radiant', test: (f) => new Set(f.watchedYears.map((y) => Math.floor(y / 10))).size >= 7 },
  { ...FEAT_TITLES.earlyMorning, test: (f) => !!f.feats.earlyMorning },
  { ...FEAT_TITLES.newYear, test: (f) => !!f.feats.newYear },
]

export const HIDDEN_COUNT = HIDDEN.length

// 特別な称号: 持てる人が決まっているもの。手に入れた人にだけ見せ、数にも伏せ字の枠にも入れない（ほかの人には取れないので）。
// Annict を創った shimbaco さんへの敬意として。ユーザー名は Annict の API が返すログイン中の本人のもの
const SPECIAL: readonly { id: string; name: Text; condition: Text; rarity: Rarity; test: (f: Facts) => boolean }[] = [
  { id: 'special-creator', name: { ja: '記録の世界を創りし者', en: 'Creator of the Realm of Records' }, condition: { ja: 'Annictを創った人だけが持つ称号', en: 'A title only the creator of Annict can hold' }, rarity: 'origin', test: (f) => f.stats?.username === 'shimbaco' },
  // Annict サポーターの称号も考えたが、サポーターかは API に無い（プロフィールページにしか出ない）ので入れない。
  // Annict は API で取れるものだけを使う（設計の原則）。編集者も外から見分ける方法が無い
]

// その年の干支（2026年＝丙午）。年の称号の名前に使う（年の数字は条件の欄に出す）
// 日本語の名前の元になる漢字なので、そのままにする（英語の名前は下の etoNameEn）
const STEMS = '甲乙丙丁戊己庚辛壬癸' // i18n-ok
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥' // i18n-ok
export function etoOf(year: number): string {
  const i = (((year - 4) % 60) + 60) % 60
  return STEMS[i % 10] + BRANCHES[i % 12]
}

// 干支の英語名（2026年＝丙午 → Fire Horse）。十干は五行、十二支は動物にする
const STEM_ELEMENTS = ['Wood', 'Wood', 'Fire', 'Fire', 'Earth', 'Earth', 'Metal', 'Metal', 'Water', 'Water']
const BRANCH_ANIMALS = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig']
function etoNameEn(year: number): string {
  const i = (((year - 4) % 60) + 60) % 60
  return `${STEM_ELEMENTS[i % 10]} ${BRANCH_ANIMALS[i % 12]}`
}
function yearTitleName(year: number): string {
  return t(`${etoOf(year)}を統べる者`, `Lord of the ${etoNameEn(year)}`)
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

  for (const st of SEASON_TITLES) {
    const value = st.half ? half : full
    out.push({
      id: st.id,
      name: tx(st.name),
      condition: st.half
        ? t('1つのクールで、人気作の半分に答える', 'Answer half of the popular anime in one season')
        : st.goal === 1
          ? t('1つのクールを踏破する（人気作すべてに答える）', 'Clear one season (answer every popular anime)')
          : t(`${st.goal}のクールを踏破する`, `Clear ${st.goal} seasons`),
      group: 'season',
      rarity: st.rarity,
      hidden: false,
      unlocked: value >= st.goal,
      progress: { value: Math.min(value, st.goal), goal: st.goal, unit: t('クール', 'seasons') },
    })
  }

  // 見た作品の本数（Annict の記録全体。Anipair の前に Annict で付けた分も入る）
  const watched = f.stats?.watchedCount ?? 0
  for (const wt of WATCHED_TITLES) {
    out.push({
      id: wt.id,
      name: tx(wt.name),
      condition: t(`見た作品を${wt.goal.toLocaleString()}本にする`, `Reach ${wt.goal.toLocaleString()} watched anime`),
      group: 'watched',
      rarity: wt.rarity,
      hidden: false,
      unlocked: watched >= wt.goal,
      progress: f.stats ? { value: Math.min(watched, wt.goal), goal: wt.goal, unit: t('本', 'anime') } : null,
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
    out.push({
      id: `year-${year}`,
      name: yearTitleName(year),
      condition: t(`${year}年の4クールをすべて踏破する`, `Clear all 4 seasons of ${year}`),
      group: 'year',
      rarity: YEAR_RARITY,
      hidden: false,
      unlocked: true,
      progress: null,
    })
  }
  const nearest = [...years].filter(([, n]) => n < SEASON_NAMES.length).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  if (nearest) {
    const [year, n] = nearest
    out.push({
      id: `year-${year}`,
      name: yearTitleName(year),
      condition: t(`${year}年の4クールをすべて踏破する`, `Clear all 4 seasons of ${year}`),
      group: 'year',
      rarity: YEAR_RARITY,
      hidden: false,
      unlocked: false,
      progress: { value: n, goal: SEASON_NAMES.length, unit: t('クール', 'seasons') },
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
      name: tx(SEASON_NAME_TITLES[name]),
      condition: t(`${seasonNameLabel(name)}のクールを${SAME_SEASON_GOAL}つ踏破する`, `Clear ${SAME_SEASON_GOAL} ${seasonNameLabel(name)} seasons`),
      group: 'season',
      rarity: 'silver',
      hidden: false,
      unlocked: value >= SAME_SEASON_GOAL,
      progress: { value: Math.min(value, SAME_SEASON_GOAL), goal: SAME_SEASON_GOAL, unit: t('クール', 'seasons') },
    })
  }

  // 今のクールを踏破
  const current = f.coverage.get(toSlug(seasonOf(f.now)))
  out.push({
    id: 'season-current',
    // 今期＝最前線
    name: t('最前線の観測者', 'Frontline Observer'),
    condition: t('今のクールを踏破する', 'Clear the current season'),
    group: 'season',
    rarity: 'silver',
    hidden: false,
    unlocked: !!current && isFull(current),
    progress: current ? { value: Math.min(current.answered, current.total), goal: current.total, unit: t('本', 'anime') } : null,
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
    name: t('二年の不寝番', 'Two-Year Night Watch'),
    condition: t(`${STREAK_GOAL}つ続けてクールを踏破する`, `Clear ${STREAK_GOAL} seasons in a row`),
    group: 'season',
    rarity: 'gold',
    hidden: false,
    unlocked: streak >= STREAK_GOAL,
    progress: { value: Math.min(streak, STREAK_GOAL), goal: STREAK_GOAL, unit: t('クール', 'seasons') },
  })

  // 古いクールを踏破
  out.push({
    id: 'season-old',
    // 1989年まで昭和
    name: t('昭和の残響を聴く者', 'Listener to Showa Echoes'),
    condition: t(`${OLD_SEASON_BEFORE}年より前のクールを踏破する`, `Clear a season before ${OLD_SEASON_BEFORE}`),
    group: 'season',
    rarity: 'amethyst',
    hidden: false,
    unlocked: fullSeasons.some((x) => x.year < OLD_SEASON_BEFORE),
    progress: null,
  })

  // 4クールすべて踏破した年の数
  for (const yt of YEAR_COUNT_TITLES) {
    out.push({
      id: yt.id,
      name: tx(yt.name),
      condition: t(`4クールすべてを踏破した年を${yt.goal}つにする`, `Clear all 4 seasons in ${yt.goal} different years`),
      group: 'year',
      rarity: yt.rarity,
      hidden: false,
      unlocked: doneYears.length >= yt.goal,
      progress: { value: Math.min(doneYears.length, yt.goal), goal: yt.goal, unit: t('年', 'years') },
    })
  }

  // 年代: その年代のクールの人気作のうち、答えた割合
  for (const d of DECADES) {
    const ratio = decadeRatio(f.coverage, d.from)
    const pct = Math.floor(ratio * 100)
    const goal = Math.round(DECADE_GOAL * 100)
    out.push({
      id: `decade-${d.from}`,
      name: tx(d.name),
      condition: t(`${d.from}年代のクールの人気作の${goal}%に答える`, `Answer ${goal}% of the popular anime in the ${d.from}s`),
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
    name: t('二つの元号を渡りし者', 'Walker of Two Eras'),
    condition: t('ゼロ年代・テン年代・二〇年代のそれぞれで、人気作の半分に答える', 'Answer half of the popular anime in each of the 2000s, 2010s, and 2020s'),
    group: 'decade',
    rarity: 'amethyst',
    hidden: false,
    unlocked: halfEras >= THREE_ERAS.length,
    progress: { value: halfEras, goal: THREE_ERAS.length, unit: t('年代', 'decades') },
  })

  for (const sp of SPECIAL) {
    out.push({ id: sp.id, name: tx(sp.name), condition: tx(sp.condition), group: 'special', rarity: sp.rarity, hidden: true, unlocked: sp.test(f), progress: null })
  }
  for (const h of HIDDEN) {
    out.push({ id: h.id, name: tx(h.name), condition: tx(h.condition), group: 'hidden', rarity: h.rarity, hidden: true, unlocked: h.test(f), progress: null })
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
