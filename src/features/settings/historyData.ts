import changelogJa from '../../../CHANGELOG.md?raw'
import changelogEn from '../../../CHANGELOG.en.md?raw'
import { getLang, t } from '../../lib/i18n'

// 設定の「開発記録」。節目は手で書き、版の項目は CHANGELOG から引く。
// 節目の範囲は「始まりの版から次の節目の手前まで」。新しい版は自動で一番新しい節目に入るので、版を出すたびにここを直さなくてよい
// （新しい節目を作るときだけ足す）。英語の画面では CHANGELOG.en.md を使い、英語版に無い版は日本語のまま出す

// 版の中身の1行。段落・小見出し・箇条書き（depth 1 は1段下げた箇条書き）
export type ChangeBlock = { kind: 'p' | 'h' | 'li'; depth: 0 | 1; text: string }
export type ChangeEntry = { version: string; date: string; blocks: ChangeBlock[] }

export type HistoryArt = 'rate' | 'data' | 'thumb' | 'medal' | 'episodes' | 'season' | 'mascot' | 'mail' | 'lang' | 'tier'

type MilestoneSource = { from: string; art: HistoryArt; readonly title: string; readonly summary: string }

// 古い順。title と summary は読んだときの言語で返す（ファイルの一番外で t() を呼ばない）
const MILESTONES: readonly MilestoneSource[] = [
  {
    from: 'v0.1.0',
    art: 'rate',
    get title() {
      return t('1タップで記録する', 'One tap to record')
    },
    get summary() {
      return t(
        '評価・マッチング・記録の3つの画面で始まりました。クールをさかのぼって、見た作品に1タップで答えると、そのままAnnictに記録されます。',
        'Anipair began with three screens: Rate, Match and Records. Look back through past seasons and answer each anime with one tap, and it is recorded on Annict as is.',
      )
    },
  },
  {
    from: 'v0.2.0',
    art: 'data',
    get title() {
      return t('作品の情報の取り方を見直す', 'Rethinking where anime info comes from')
    },
    get summary() {
      return t(
        'Annictにある情報はAnnictから、ジャンルや似た作品はShikimoriから取るようにしました。回数の制限に当たったら、待ってから送り直します。',
        'What Annict has comes from Annict, and genres and similar anime come from Shikimori. When a rate limit is reached, Anipair waits before trying again.',
      )
    },
  },
  {
    from: 'v0.4.0',
    art: 'thumb',
    get title() {
      return t('片手で答えやすく', 'Easier to answer one-handed')
    },
    get summary() {
      return t(
        '評価の流れを1本にまとめ、よく押すボタンほど下に大きく置きました。作品の詳細に関連作品が並ぶようになりました。',
        'Rating became a single flow, with the buttons you press most placed larger and lower. Anime details now list related anime.',
      )
    },
  },
  {
    from: 'v0.7.0',
    art: 'medal',
    get title() {
      return t('称号とあらすじ', 'Titles and synopses')
    },
    get summary() {
      return t(
        'クールの人気作に答え切ると「踏破」の称号が手に入るようになりました。作品の詳細には、Wikipediaのあらすじが出ます。',
        'Answer every popular anime of a season to earn a title. Anime details now show a synopsis from Wikipedia.',
      )
    },
  },
  {
    from: 'v0.9.0',
    art: 'episodes',
    get title() {
      return t('話ごとに記録する', 'Recording episode by episode')
    },
    get summary() {
      return t(
        '見ている作品を1話ずつ評価し、感想も書けるようになりました。声優やスタッフの名前から、ほかの参加作品もたどれます。',
        'Rate the anime you are watching one episode at a time, and write reviews too. Follow a voice actor or staff name to their other anime.',
      )
    },
  },
  {
    from: 'v0.12.0',
    art: 'season',
    get title() {
      return t('画面を季節の色に作り直す', 'Screens redesigned in the season’s colors')
    },
    get summary() {
      return t(
        '画面を作り直しました。地の色は、見ているクールの季節の色です。表紙を大きく出し、記録は表紙の棚に並びます。',
        'The screens were redesigned. The background takes the color of the season you are viewing, covers are shown large, and Records became shelves of covers.',
      )
    },
  },
  {
    from: 'v0.13.0',
    art: 'mascot',
    get title() {
      return t('アニとペア', 'Ani & Pair')
    },
    get summary() {
      return t(
        'アプリの名前を2つに割った2人組が来ました。作品の詳細には、似た作品の棚と、みんなの感想が並びます。',
        'A duo named after the two halves of the app arrived. Anime details gained a shelf of similar anime and reviews from others.',
      )
    },
  },
  {
    from: 'v0.16.0',
    art: 'mail',
    get title() {
      return t('質問や要望を送れるように', 'Send questions and requests')
    },
    get summary() {
      return t(
        '設定から質問や要望を送れるようになり、よくある質問をまとめました。届いた声をもとに、細かな使いにくさを直し続けました。',
        'You can send questions and requests from Settings, and an FAQ was added. Small rough edges kept being fixed based on the feedback that came in.',
      )
    },
  },
  {
    from: 'v0.18.0',
    art: 'lang',
    get title() {
      return t('英語に対応し、初めての人にも使いやすく', 'English support, and easier for first-timers')
    },
    get summary() {
      return t(
        '画面が英語にも対応しました。初めての人は放送の終わったクールから始まり、今週の放送はカレンダーに入れられます。',
        'The screens became available in English. First-time users start from a season that has finished airing, and this week’s airings can be added to a calendar.',
      )
    },
  },
  {
    from: 'v0.20.0',
    art: 'tier',
    get title() {
      return t('Tier表', 'Tier lists')
    },
    get summary() {
      return t(
        '見た作品を段に並べる表を作れるようになりました。表紙を引いて置き場所を決め、リンクにして友だちに見せられます。',
        'Make a tier list of the anime you have watched. Drag covers to place them, and share the list with friends as a link.',
      )
    },
  },
]

export type Milestone = {
  n: number
  art: HistoryArt
  title: string
  summary: string
  // 中の版（新しい順）
  entries: ChangeEntry[]
}

// "v0.12.3" を比べられる数の並びに
function versionKey(v: string): number[] {
  return v
    .replace(/^v/, '')
    .split('.')
    .map((x) => Number.parseInt(x, 10) || 0)
}

export function compareVersions(a: string, b: string): number {
  const x = versionKey(a)
  const y = versionKey(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// CHANGELOG を版ごとに分ける。`## vX — 日付` を見出しに、その下の段落・`###`・箇条書きを順に拾う（書いてある順＝新しい順）
export function parseChangelog(raw: string): ChangeEntry[] {
  const out: ChangeEntry[] = []
  let cur: ChangeEntry | null = null
  for (const line of raw.split(/\r?\n/)) {
    const head = /^## (v\d+\.\d+\.\d+)\s*[—-]\s*(\d{4}-\d{2}-\d{2})/.exec(line)
    if (head) {
      cur = { version: head[1], date: head[2], blocks: [] }
      out.push(cur)
      continue
    }
    if (!cur || line.trim() === '') continue
    const item = /^( *)- (.*)$/.exec(line)
    if (item) cur.blocks.push({ kind: 'li', depth: item[1].length >= 2 ? 1 : 0, text: item[2].trim() })
    else if (line.startsWith('### ')) cur.blocks.push({ kind: 'h', depth: 0, text: line.slice(4).trim() })
    else cur.blocks.push({ kind: 'p', depth: 0, text: line.trim() })
  }
  return out
}

// 英語の画面: 英語版にある版はそれを、無い版は日本語のまま
export function localizeEntries(ja: ChangeEntry[], en: ChangeEntry[] | null): ChangeEntry[] {
  if (!en) return ja
  const byVersion = new Map(en.map((e) => [e.version, e]))
  return ja.map((e) => byVersion.get(e.version) ?? e)
}

// 版を節目に振り分ける（新しい節目から順に）。どの節目より古い版は、一番古い節目に入れる
export function groupMilestones(entries: ChangeEntry[], sources: readonly MilestoneSource[] = MILESTONES): Milestone[] {
  const ms = sources.map((s, i) => ({ n: i + 1, art: s.art, title: s.title, summary: s.summary, from: s.from, entries: [] as ChangeEntry[] }))
  for (const e of entries) {
    let target = ms[0]
    for (const m of ms) if (compareVersions(e.version, m.from) >= 0) target = m
    target.entries.push(e)
  }
  return ms
    .filter((m) => m.entries.length > 0)
    .reverse()
    .map((m) => ({ n: m.n, art: m.art, title: m.title, summary: m.summary, entries: m.entries }))
}

// 開発記録の一番上に出す、最新の版の短いまとめ。先頭にまとめの段落があればそれを、無ければ各項目の最初の一文を並べる
// （項目は長いので、全部は節目を開いた1枚で読む）
export type Brief = { kind: 'lead'; text: string } | { kind: 'items'; items: string[] }

// 日本語の「。」か英語の「. 」で切る（文を出すのではなく、句点の文字を探すだけ）
const firstSentence = (text: string) => /^.*?(。|\.(\s|$))/.exec(text)?.[0].trim() ?? text // i18n-ok

export function briefOf(entry: ChangeEntry): Brief {
  const lead: string[] = []
  for (const b of entry.blocks) {
    if (b.kind !== 'p') break
    lead.push(b.text)
  }
  if (lead.length > 0) return { kind: 'lead', text: lead.join(' ') }
  return { kind: 'items', items: entry.blocks.filter((b) => b.kind === 'li' && b.depth === 0).map((b) => firstSentence(b.text)) }
}

export type History = { latest: ChangeEntry | null; milestones: Milestone[] }

export function loadHistory(lang: 'ja' | 'en' = getLang()): History {
  const entries = localizeEntries(parseChangelog(changelogJa), lang === 'en' ? parseChangelog(changelogEn) : null)
  return { latest: entries[0] ?? null, milestones: groupMilestones(entries) }
}

// 節目の版の範囲（中は新しい順）。「v0.20.0〜v0.21.0」（sep は画面の言語の「〜」）
export function versionRange(m: Milestone, sep: string): string {
  const first = m.entries[m.entries.length - 1]?.version ?? ''
  const last = m.entries[0]?.version ?? ''
  return first === last ? first : `${first}${sep}${last}`
}

// 節目の日付の範囲（"2026-10-25" → 画面の言語の短い形）
export function dateRange(m: Milestone, format: (iso: string) => string, sep: string): string {
  const first = m.entries[m.entries.length - 1]?.date
  const last = m.entries[0]?.date
  if (!first || !last) return ''
  return first === last ? format(first) : `${format(first)}${sep}${format(last)}`
}
