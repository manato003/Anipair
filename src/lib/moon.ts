// 右上の月（base.css の --moon・--moon-dawn）を、今日の月齢の形で描く。applyTheme が付け直す（10分ごと）。
// 月齢は平均の朔望月で数える（実際の満ち欠けとは半日ほどずれることがある。飾りなので足りる）。
// 形は紹介ページの三日月（Landing.tsx の Crescent）に合わせ、光る側を地平の太陽の方（満ちるときは右下、欠けるときは左下）へ傾ける。
// 新月の前後でも消えないよう、細い三日月より細くはしない
import type { Text } from './i18n'

const SYNODIC = 29.530588853
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
const DAY = 24 * 60 * 60 * 1000
const MIN_LIT = 0.1
const TILT = 39

export interface MoonPhase {
  age: number // 新月からの日数
  lit: number // 光って見える割合（0〜1）
  waxing: boolean
}

export function moonPhase(date: Date): MoonPhase {
  const age = ((((date.getTime() - NEW_MOON) / DAY) % SYNODIC) + SYNODIC) % SYNODIC
  return { age, lit: (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2, waxing: age < SYNODIC / 2 }
}

const round = (n: number) => Math.round(n * 100) / 100

// 光る所の形。右半分の縁と、明暗の境目（楕円の半分）で囲む。三日月なら境目は右へ、十三夜なら左へふくらむ
function litPath(lit: number): string {
  const c = 1 - 2 * Math.max(MIN_LIT, lit)
  return `M24 6A18 18 0 0 1 24 42A${round(18 * Math.abs(c))} 18 0 0 ${c > 0 ? 0 : 1} 24 6Z`
}

function tilt(phase: MoonPhase): string {
  return phase.waxing ? `rotate(${TILT} 24 24)` : `rotate(${-TILT} 24 24) matrix(-1 0 0 1 48 0)`
}

const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`

// 夜の月: 光る所を淡い金色で塗り、光る縁から境目へ淡くする。満月に近いほど全体を明るく（淡いままだと、くすんだ灰色に見えた）。
// 欠けた所は地球照でうっすら見せる
export function nightMoon(phase: MoonPhase): string {
  const r = round(27 + 20 * phase.lit)
  const edge = round(0.62 + 0.18 * phase.lit)
  const fade = round(0.18 + 0.47 * phase.lit)
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="42" cy="24" r="${r}"><stop offset="0" stop-color="#f6e8ce" stop-opacity="${edge}"/><stop offset="1" stop-color="#f6e8ce" stop-opacity="${fade}"/></radialGradient></defs>` +
      `<circle cx="24" cy="24" r="18" fill="#eef0fa" fill-opacity=".045"/><path d="${litPath(phase.lit)}" transform="${tilt(phase)}" fill="url(#g)"/></svg>`,
  )
}

// 有明の月: 明るい地に溶けて消えないよう、欠けた所を藤色でうっすら塗り、光る側の縁に細い線を引く
export function dawnMoon(phase: MoonPhase): string {
  const d = litPath(phase.lit)
  const tr = tilt(phase)
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><clipPath id="c"><path d="${d}" transform="${tr}"/></clipPath></defs>` +
      `<circle cx="24" cy="24" r="18" fill="#8a80b8" fill-opacity=".1"/><path d="${d}" transform="${tr}" fill="#fff"/>` +
      `<circle cx="24" cy="24" r="17.5" fill="none" stroke="#9f95c8" stroke-width="1" stroke-opacity=".75" clip-path="url(#c)"/></svg>`,
  )
}

// ── 月の説明（右上の月を押す・マウスを載せると出す。components/MoonInfo.tsx）──

// 月齢（四捨五入）ごとの名前。日本の呼び名がある日はそれを、無い日は満ち欠けの様子を出す。
// reading は名前に添える読み（英語の画面ではローマ字。英語の名前で足りるものは空）
export interface MoonName {
  name: Text
  reading?: Text
  note?: Text
}

const WAXING: MoonName = { name: { ja: '満ちていく月', en: 'Waxing moon' } }
const WANING: MoonName = { name: { ja: '欠けていく月', en: 'Waning moon' } }
const FIRST: MoonName = {
  name: { ja: '上弦の月', en: 'First quarter' },
  reading: { ja: 'じょうげんのつき', en: '' },
  note: { ja: '夕方の南の空に高く、右半分が光ります。', en: 'Half lit, high in the south at dusk.' },
}
const FULL: MoonName = {
  name: { ja: '満月', en: 'Full moon' },
  reading: { ja: 'まんげつ', en: '' },
  note: { ja: '日の入りのころに昇り、ひと晩じゅう空にあります。', en: 'Rises around sunset and stays up all night.' },
}
const LAST: MoonName = {
  name: { ja: '下弦の月', en: 'Last quarter' },
  reading: { ja: 'かげんのつき', en: '' },
  note: { ja: '真夜中に昇り、明け方の南の空で左半分が光ります。', en: 'Rises around midnight; half lit in the south at dawn.' },
}
const DAWN: MoonName = {
  name: { ja: '有明月', en: 'Dawn moon' },
  reading: { ja: 'ありあけづき', en: 'Ariakezuki' },
  note: { ja: '夜明けの空に残る月です。', en: 'Still in the sky as dawn breaks.' },
}

const NAMES: MoonName[] = [
  {
    name: { ja: '新月', en: 'New moon' },
    reading: { ja: 'しんげつ', en: '' },
    note: { ja: '太陽と同じ方にあり、ほとんど見えません。', en: 'Lined up with the sun, so it is barely visible.' },
  },
  {
    name: { ja: '二日月', en: 'Second-day moon' },
    reading: { ja: 'ふつかづき', en: 'Futsukazuki' },
    note: { ja: '日の入りのすぐ後、西の低い空にかすかに見えます。', en: 'Faint and low in the west just after sunset.' },
  },
  {
    name: { ja: '三日月', en: 'Crescent' },
    reading: { ja: 'みかづき', en: 'Mikazuki' },
    note: { ja: '夕方の西の空に細く光ります。', en: 'A thin arc in the western evening sky.' },
  },
  WAXING,
  WAXING,
  WAXING,
  WAXING,
  FIRST,
  FIRST,
  WAXING,
  WAXING,
  WAXING,
  {
    name: { ja: '十三夜', en: '13th night' },
    reading: { ja: 'じゅうさんや', en: "Jūsan'ya" },
    note: { ja: '満月の少し前。昔から満月の次に美しいとされます。', en: 'Just before full; long held to be nearly as lovely as the full moon.' },
  },
  {
    name: { ja: '小望月', en: 'Eve of the full moon' },
    reading: { ja: 'こもちづき', en: 'Komochizuki' },
    note: { ja: '満月の前の夜の月です。', en: 'The night before the full moon.' },
  },
  FULL,
  FULL,
  {
    name: { ja: '十六夜', en: 'Hesitating moon' },
    reading: { ja: 'いざよい', en: 'Izayoi' },
    note: { ja: '満月の次の夜。ためらうように少し遅れて昇ります。', en: 'The night after full; rises a little late, as if hesitating.' },
  },
  {
    name: { ja: '立待月', en: 'Standing-wait moon' },
    reading: { ja: 'たちまちづき', en: 'Tachimachizuki' },
    note: { ja: '立って待つうちに昇ります。', en: 'Rises while you wait standing.' },
  },
  {
    name: { ja: '居待月', en: 'Sitting-wait moon' },
    reading: { ja: 'いまちづき', en: 'Imachizuki' },
    note: { ja: '座って待つほど遅く昇ります。', en: 'Late enough that you sit down to wait.' },
  },
  {
    name: { ja: '寝待月', en: 'Lying-down moon' },
    reading: { ja: 'ねまちづき', en: 'Nemachizuki' },
    note: { ja: '寝て待つほど遅く昇ります。', en: 'Late enough to wait lying down.' },
  },
  {
    name: { ja: '更待月', en: 'Late-night moon' },
    reading: { ja: 'ふけまちづき', en: 'Fukemachizuki' },
    note: { ja: '夜が更けてから昇ります。', en: 'Rises late at night.' },
  },
  WANING,
  LAST,
  LAST,
  WANING,
  WANING,
  DAWN,
  DAWN,
  WANING,
  {
    name: { ja: '晦日月', en: 'Month-end moon' },
    reading: { ja: 'みそかづき', en: 'Misokazuki' },
    note: { ja: '新月の直前。明け方の東の空にごく細く、ほとんど見えません。', en: 'Just before the new moon; a hairline in the east at dawn, rarely seen.' },
  },
]

export function moonName(age: number): MoonName {
  return NAMES[Math.round(age) % NAMES.length]
}

// 月の出・南中・月の入りを出す場所。日本の時間帯なら東京、ほかは時間帯から経度を見積もる（目安）
export interface Place {
  lat: number
  lng: number
  tokyo: boolean
}

export function guessPlace(now: Date = new Date()): Place {
  let zone = ''
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // 時間帯が分からなければ、時差から見積もる
  }
  if (zone === 'Asia/Tokyo') return { lat: 35.68, lng: 139.77, tokyo: true }
  return { lat: 35, lng: -now.getTimezoneOffset() / 4, tokyo: false }
}

const RAD = Math.PI / 180
const J2000 = Date.UTC(2000, 0, 1, 12)

// 月の高さ（度）。地球の中心から見た位置を、大きい項だけで求める（Meeus の式の先頭。出入りの時刻で数分ずれることがある。表示は「ごろ」）
export function moonAltitude(ms: number, place: Pick<Place, 'lat' | 'lng'>): number {
  const d = (ms - J2000) / DAY
  const L = RAD * (218.316 + 13.176396 * d)
  const M = RAD * (134.963 + 13.064993 * d) // 月の平均近点角
  const F = RAD * (93.272 + 13.22935 * d)
  const D = RAD * (297.85 + 12.190749 * d) // 太陽からの離角
  const S = RAD * (357.529 + 0.98560028 * d) // 太陽の平均近点角
  const l =
    L +
    RAD *
      (6.289 * Math.sin(M) +
        1.274 * Math.sin(2 * D - M) +
        0.658 * Math.sin(2 * D) -
        0.186 * Math.sin(S) -
        0.114 * Math.sin(2 * F) +
        0.059 * Math.sin(2 * D - 2 * M) +
        0.057 * Math.sin(2 * D - S - M) +
        0.053 * Math.sin(2 * D + M))
  const b = RAD * (5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) + 0.173 * Math.sin(2 * D - F))
  const e = RAD * 23.4397
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  const hour = RAD * (280.16 + 360.9856235 * d) + RAD * place.lng - ra
  const phi = RAD * place.lat
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(hour)) / RAD
}

// 月の中心がこの高さのとき、上の縁が地平線に出入りする（視差・大気の屈折・月の半径を合わせた値）
const HORIZON = 0.125
const STEP = 10 * 60 * 1000

export interface MoonPass {
  rise: Date | null
  transit: Date | null
  set: Date | null
}

// いま空にあるなら、その出から入りまで。沈んでいるなら、次の出から入りまで
export function moonPass(now: Date, place: Pick<Place, 'lat' | 'lng'>): MoonPass {
  const h = (ms: number) => moonAltitude(ms, place) - HORIZON
  // from から dir の向きへ、出（rising）か入りの時刻を探す（2日まで）。10分ごとに測り、間は直線で割る
  const cross = (from: number, dir: 1 | -1, rising: boolean): number | null => {
    let a = from
    let ha = h(a)
    for (let i = 0; i < 288; i++) {
      const b = a + dir * STEP
      const hb = h(b)
      const [x, hx, y, hy] = dir > 0 ? [a, ha, b, hb] : [b, hb, a, ha]
      if (rising ? hx <= 0 && hy > 0 : hx > 0 && hy <= 0) return x + ((y - x) * hx) / (hx - hy)
      a = b
      ha = hb
    }
    return null
  }
  const t0 = now.getTime()
  const up = h(t0) > 0
  const rise = cross(t0, up ? -1 : 1, true)
  const set = up ? cross(t0, 1, false) : rise === null ? null : cross(rise, 1, false)
  let transit: number | null = null
  if (rise !== null && set !== null) {
    // 出から入りのあいだで一番高い時刻。10分ごとに当たりを付け、前後10分を1分ごとに詰める
    const best = (from: number, to: number, step: number) => {
      let top = from
      for (let x = from; x <= to; x += step) if (h(x) > h(top)) top = x
      return top
    }
    const rough = best(rise, set, STEP)
    transit = best(Math.max(rise, rough - STEP), Math.min(set, rough + STEP), 60 * 1000)
  }
  const date = (ms: number | null) => (ms === null ? null : new Date(ms))
  return { rise: date(rise), transit: date(transit), set: date(set) }
}
