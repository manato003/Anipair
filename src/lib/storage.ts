import type { GithubConnection } from './github'
import { parseSlug, toSlug, type Season } from './season'

// 端末に保存する値。読むときは必ず形を確かめ、壊れていたら無かったことにする
// （保存済みの壊れた値で描画が落ち続けるのを防ぐ）

const KEYS = {
  annictToken: 'animax.annictToken',
  backfillSeason: 'animax.backfill.season',
  // 旧: 「見てない」の作品 ID の配列。いまは unseen に移した（読んで移したら消す）
  skipped: 'animax.backfill.skipped',
  unseen: 'animax.backfill.unseen',
  // 見たいの作品の「優先して見る」の印と短いメモ（GitHub の wanna-notes.json と同期する）
  wannaNotes: 'animax.wannaNotes.v1',
  // 旧: 前の版の表紙の控え（animax.covers.v1。別の出どころの画像で、形も違う）。新しい鍵（v2）に切り替えて、旧い方は clearLegacyCovers で消す
  legacyCovers: 'animax.covers.v1',
  covers: 'animax.covers.v2',
  similar: 'animax.similar.v1',
  githubToken: 'animax.githubToken',
  githubRepo: 'animax.githubRepo',
  passes: 'animax.passes',
  keymap: 'animax.keymap',
  matchFilter: 'animax.match.filter',
  backup: 'animax.backup',
  // 自分の感想の控え（差分で読むための印つき）。今のトークンの持ち主のもので、トークンが変わったら消す
  reviews: 'animax.reviews.v1',
  // 保存していない感想の下書き（作品の Annict ID ごと）。今のトークンの持ち主のもので、トークンが変わったら消す
  reviewDrafts: 'animax.reviewDrafts.v1',
  // Annict から最後に読んだ自分のライブラリと、評価の画面のクールの作品（起動したらまずこれで出す。lib/offlineCache.ts）。
  // 今のトークンの持ち主のもので、トークンが変わったら消す
  library: 'animax.library.v1',
  seasonWorks: 'animax.seasonWorks.v1',
  // Annict に送る前・送れなかった書き込み（最終的にどうしたいか）。次に開いたときに送り直せるように（lib/writeJournal.ts）。
  // 届いたか分からない作成の印（lib/uncertainWrites.ts）。どちらも今のトークンの持ち主のもので、トークンが変わったら消す
  writeJournal: 'animax.writeJournal.v1',
  uncertainWrites: 'animax.uncertainWrites.v1',
  // 「見てる」の山で「まだ見てる」と答えた作品と時刻（1週間は聞き直さない。features/rate/stillWatching.ts）。今のトークンの持ち主のもの
  stillWatching: 'animax.stillWatching.v1',
  // 書いている途中の話の感想（話の ID ごと。features/records/episodeDrafts.ts）。今のトークンの持ち主のもの
  episodeDrafts: 'animax.episodeDrafts.v1',
  // 初めての人への案内（評価画面の「Anipair の使い方」）を見たか。端末ごと
  onboarding: 'animax.onboarding.v1',
  // スマホで「シートはタップで閉じる」の案内を見たか
  sheetHint: 'animax.sheetHint.v1',
  // クールごとの人気作の ID の控え（進み具合の分母。だれのものでも同じなので、トークンが変わっても使える）
  seasonTops: 'animax.seasonTops.v1',
  // 称号: 装備しているもの・見たもの・初回の「覚醒」を見たか
  titles: 'animax.titles.v1',
  // Anipair の中での出来事（深夜の記録・1日でのクールの踏破など。Annict からは計算できないもの）
  feats: 'animax.feats.v1',
  // 演出の強さ（ふつう・控えめ・なし）。端末ごと
  effects: 'animax.effects.v1',
  // 評価とマッチングの答えのボタンの表示（アイコンと名前・アイコンだけ・名前だけ）。端末ごと
  buttonLabels: 'animax.buttonLabels.v1',
  // 画面の色（テーマの色・明るさ・時刻・片手操作）。端末ごと。読み書きは lib/theme.ts
  theme: 'animax.theme.v1',
  // 下の「人ごとの記録」がいま誰のものか（Annict のユーザー名）
  owner: 'animax.owner.v1',
  // ログアウト・アカウントの切り替えで退避した、人ごとの記録（ユーザー名 → 鍵 → 値）。同じ人がログインし直したら戻す
  accounts: 'animax.accounts.v1',
} as const

export const ALL_KEYS: readonly string[] = Object.values(KEYS)

// 別のタブで変わったら、このタブを読み込み直す鍵（ログイン・ログアウト・アカウントの切り替え）
export const ACCOUNT_KEYS: readonly string[] = [KEYS.annictToken, KEYS.owner]

function rawRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

// ── このページが、いまの持ち主のものか ──
// ページを開いたときのトークンと持ち主を覚える。端末の内容がそれと違えば（このページで切り替えた・別のタブで切り替えた・
// 戻るボタンでよみがえった古いページ）、このページは古い。古いページには、人ごとの記録を読ませず・書かせず、
// Annict と GitHub に通信させない（annict.ts・github.ts が pageIsCurrent を見る）。
// 2026-10-06 のセキュリティの点検: 切り替えのあと読み込み直すまでの一瞬に、前の人の画面が次の人の記録を読んで前の人の GitHub に送れた
let frozen = false
// ページを開いてから最初に読み書きしたときのトークンと持ち主（アプリは開いてすぐにトークンを読むので、開いたときのものになる）
let page: { token: string | null; owner: string | null } | null = null
function pageState(): { token: string | null; owner: string | null } {
  page ??= { token: rawRead('animax.annictToken'), owner: rawRead('animax.owner.v1') }
  return page
}

// このページでの切り替えを終えた。読み込み直すまで、何も読み書き・通信しない
export function freezeStorage(): void {
  frozen = true
}

// 切り替えを終えて、読み込み直すのを待っているか（ページを去る確認を出さない。useWriteQueue）
export function isFrozen(): boolean {
  return frozen
}

export function pageIsCurrent(): boolean {
  const p = pageState()
  return !frozen && rawRead(KEYS.annictToken) === p.token && rawRead(KEYS.owner) === p.owner
}

// テストのたびに、開いたばかりのページに戻す（src/test/setup.ts）
export function resetPageForTests(): void {
  frozen = false
  page = null
}

function read(key: string): string | null {
  // 最初に読んだ時点で、このページの持ち主を覚える（アプリは開いてすぐトークンを読む）
  pageState()
  if (GUARDED.has(key) && !pageIsCurrent()) return null
  return rawRead(key)
}

function write(key: string, value: string | null): void {
  if (!pageIsCurrent()) return
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch (e) {
    // 端末の保存容量があふれたら、作り直せる控えを捨てて、もう一度だけ書く（送れなかった記録の控えなど、失いたくないものを守る。
    // 2026-10-07 の点検: 容量を超えると黙って捨てていて、閉じても送り直せるはずの控えが残らないことがあった）
    if (value === null || !isQuotaError(e)) return
    for (const k of REBUILDABLE) {
      if (k === key) continue
      try {
        localStorage.removeItem(k)
      } catch {
        // 消せなければ次へ
      }
    }
    try {
      localStorage.setItem(key, value)
    } catch {
      // それでも入らなければ、その回の操作だけ有効にする（保存できない環境・プライベートブラウズなど）
    }
  }
}

// 端末の保存容量があふれたときに捨ててよい控え（どれも、Annict・Shikimori から読み直せば作り直せる）
const REBUILDABLE: readonly string[] = [KEYS.covers, KEYS.similar, KEYS.library, KEYS.seasonWorks, KEYS.seasonTops, KEYS.reviews]

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
}

function readJson(key: string): unknown {
  const raw = read(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function loadAnnictToken(): string | null {
  const t = read(KEYS.annictToken)
  return t && t.trim() ? t.trim() : null
}

export function saveAnnictToken(token: string | null): void {
  // Annict から読んだ記録の写しは、トークンが変わったら消す（開いたときに Annict から読み直せる）。
  // 送れなかった記録の控え・書きかけ・「まだ見てる」などは人ごとの記録として持ち、switchAccount が入れ替える
  // （同じ人がログインし直しても失わない。2026-10-06 のセキュリティの点検）
  const next = token && token.trim() ? token.trim() : null
  if (loadAnnictToken() !== next) {
    for (const key of ANNICT_COPIES) write(key, null)
  }
  write(KEYS.annictToken, token)
  // このページでの切り替え（ページは、このあと読み込み直す）
  if (!frozen) pageState().token = rawRead(KEYS.annictToken)
}

// ── 人ごとの記録 ──
// Annict の記録の写しはトークンが変わったら消す（saveAnnictToken）。一方、Annict に置き場所の無い記録（パス・見てない・見たいのメモ・
// 称号・GitHub のつなぎなど）は、ログインし直す（「Annict でログイン」はそのたびに新しいトークンになる）たびに消すと失われる。
// なので Annict のユーザー名で持ち主を覚え、別の人に替わるときだけ、前の人の分を退避して次の人の分を戻す
// （2026-10-06 の点検: 共有の端末で、前の人の称号やパスが次の人に引き継がれ、GitHub のバックアップにも混ざっていた）
// Annict から読んだ自分の記録の写し（トークンが変わったら消す）
const ANNICT_COPIES: readonly string[] = [KEYS.reviews, KEYS.library, KEYS.seasonWorks]

const PERSONAL_KEYS: readonly string[] = [
  KEYS.writeJournal,
  KEYS.uncertainWrites,
  KEYS.stillWatching,
  KEYS.episodeDrafts,
  KEYS.reviewDrafts,
  // 似た作品の鍵は好きな作品、表紙の控えは見た作品の ID（好みと記録が分かる）
  KEYS.similar,
  KEYS.covers,
  KEYS.backfillSeason,
  KEYS.skipped,
  KEYS.unseen,
  KEYS.wannaNotes,
  KEYS.githubToken,
  KEYS.githubRepo,
  KEYS.passes,
  KEYS.matchFilter,
  KEYS.backup,
  KEYS.titles,
  KEYS.feats,
]

// GitHub のトークンは、退避の控えにも残さない（ログアウトで消す。次の人が端末の中を覗いても読めない。もう一度つなぐときに入れ直す）
const NOT_KEPT: readonly string[] = [KEYS.githubToken]

// 古いページに読ませない鍵（人ごとの記録と、Annict の記録の写し）
const GUARDED: ReadonlySet<string> = new Set([...PERSONAL_KEYS, ...ANNICT_COPIES])

type Accounts = Record<string, Record<string, string>>

// 鍵は利用者の名前なので、プロトタイプを持たないオブジェクトにする（`__proto__` という名前の人の分が消えないように。2026-10-06 の点検）
function loadAccounts(): Accounts {
  const out: Accounts = Object.create(null) as Accounts
  const v = readJson(KEYS.accounts)
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [name, saved] of Object.entries(v as Record<string, unknown>)) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue
    const kept = Object.entries(saved as Record<string, unknown>).filter((e): e is [string, string] => PERSONAL_KEYS.includes(e[0]) && typeof e[1] === 'string')
    if (kept.length > 0) out[name] = Object.fromEntries(kept)
  }
  return out
}

export function loadOwner(): string | null {
  return read(KEYS.owner)
}

// 名前をまだ確かめられないログインのあいだの記録は、そのときのトークンの印（トークンそのものではなく、短いハッシュ）を持ち主にする。
// 同じトークンで名前が分かったときだけ、その人のものにする（名前が分からないままログアウトした記録を、次の別の人に引き継がない。
// 2026-10-06 のセキュリティの点検の指摘）
function tokenMark(token: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `?${h.toString(36)}`
}

// いまログインしている人に、人ごとの記録を合わせる。
// - username: Annict のユーザー名。分からなければ null（token があれば、名前の分からないログイン。どちらも無ければログアウト）
// - ログアウトのあとの持ち主は「ログアウト済み」の印にする（持ち主を覚えていない＝この仕組みの前から、と区別する）
// - 前の持ち主の分は退避して空にする（名前が分からないのに前の人の記録を見せたり、前の人の GitHub に書いたりしない）
// - 名前の分からないあいだに付けた記録は、同じトークンで名前が分かったら、その人のものとして残す
// - 次の人の退避していた分を戻す（空のあいだに付けた分は残し、無い分だけ戻す）
// - 持ち主を覚えていない記録（この仕組みの前から使っている端末）は、最初の人のものとみなす（前からの状態と同じ）
// 記録を入れ替えたら true（画面を作り直す）
// ログアウトしたあとの持ち主の印。このあいだに書かれた記録（別のタブの遅れた書き込みなど）は、誰のものとも確かめられないので次の人に渡さない
const LOGGED_OUT = '!'
// 誰のものか確かめられない持ち主（名前の分からないログイン・ログアウトのあと）
const unattributable = (owner: string) => owner.startsWith('?') || owner === LOGGED_OUT

export function switchAccount(username: string | null, token: string | null = null): boolean {
  const owner = loadOwner()
  const mark = token ? tokenMark(token) : null
  const target = username ?? mark ?? LOGGED_OUT
  if (owner === target) return false
  const accounts = loadAccounts()
  let changed = false
  // 名前の分からなかったログインが、同じトークンのまま名前が分かった
  const identified = owner !== null && owner === mark
  if (owner !== null && !identified) {
    const mine = takePersonal()
    if (Object.keys(mine).length > 0) changed = true
    // 名前の分からなかったログインの記録は、トークンが替わる・ログアウトすると持ち主を確かめる道が無くなるので、退避せずに消す。
    // ログアウトのあとに書かれた記録も同じ
    if (Object.keys(mine).length > 0 && !unattributable(owner)) accounts[owner] = mine
  }
  for (const from of new Set([username, mark])) {
    if (from === null || !accounts[from]) continue
    putBack(accounts[from])
    delete accounts[from]
    changed = true
  }
  saveAccounts(accounts)
  setOwner(target)
  return changed
}

// 人ごとの記録を端末から取り出す（GitHub のトークンは控えに残さず消す）
function takePersonal(): Record<string, string> {
  const mine: Record<string, string> = {}
  for (const key of PERSONAL_KEYS) {
    const value = read(key)
    if (value !== null && !NOT_KEPT.includes(key)) mine[key] = value
    write(key, null)
  }
  return mine
}

function putBack(kept: Record<string, string>): void {
  for (const [key, value] of Object.entries(kept)) {
    const current = read(key)
    write(key, current === null ? value : mergeKept(key, current, value))
  }
}

function saveAccounts(accounts: Accounts): void {
  write(KEYS.accounts, Object.keys(accounts).length > 0 ? JSON.stringify(accounts) : null)
}

// このページでの持ち主の変更（ページはこのあと読み込み直すか、同じ人のまま続ける）
function setOwner(owner: string | null): void {
  write(KEYS.owner, owner)
  if (!frozen) pageState().owner = rawRead(KEYS.owner)
}

// ── 持ち主を確かめられなかった以前の記録 ──
// この仕組みの前から使っている端末で、前の人の名前を確かめられないまま切り替えるとき、その記録は消さずに隔離し、
// ログインした人に「あなたの記録ですか」と聞いてから戻す（黙って渡さない・黙って消さない。2026-10-06 のセキュリティの点検）
const UNCLAIMED = '?unclaimed'

export function setAsideUnclaimed(): void {
  const mine = takePersonal()
  // 前の人の送れなかった記録の控えと「届いたか分からない」印は隔離しない（受け取った人のトークンで、前の人の答えを送らないように）
  delete mine[KEYS.writeJournal]
  delete mine[KEYS.uncertainWrites]
  if (Object.keys(mine).length === 0) return
  const accounts = loadAccounts()
  accounts[UNCLAIMED] = { ...(accounts[UNCLAIMED] ?? {}), ...mine }
  saveAccounts(accounts)
}

export function hasUnclaimed(): boolean {
  return !!loadAccounts()[UNCLAIMED]
}

// 自分のものとして受け取る（いまの記録と合わせる）か、消す
export function settleUnclaimed(mine: boolean): void {
  const accounts = loadAccounts()
  const kept = accounts[UNCLAIMED]
  if (!kept) return
  if (mine) putBack(kept)
  delete accounts[UNCLAIMED]
  saveAccounts(accounts)
}

// 戻す記録と、名前の分からなかったあいだに付けた記録の両方があるとき。どちらも作品などの ID を鍵にした表なら合わせ、
// そうでなければ、その人の積み重ね（戻す方）を残す（名前の分からなかった短いあいだの分より重い。2026-10-06 のセキュリティの点検）
function mergeKept(key: string, current: string, kept: string): string {
  try {
    const a = JSON.parse(current) as unknown
    const b = JSON.parse(kept) as unknown
    const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
    // 送れなかった記録の控え（{ v, entries: [...] }）と「届いたか分からない」印（[...]）は、どちらも残す（送り漏れ・二重の作成を防ぐ）。
    // 同じ項目の控えは、新しく頼んだ方（at が大きい方）を残す
    if (key === KEYS.writeJournal && plain(a) && plain(b) && Array.isArray(a.entries) && Array.isArray(b.entries)) {
      const byKey = new Map<string, Record<string, unknown>>()
      for (const e of [...b.entries, ...a.entries] as Record<string, unknown>[]) {
        const k = String(e?.key)
        const prev = byKey.get(k)
        if (!prev || Number(e?.at) >= Number(prev.at)) byKey.set(k, e)
      }
      return JSON.stringify({ ...b, entries: [...byKey.values()] })
    }
    if (key === KEYS.uncertainWrites && Array.isArray(a) && Array.isArray(b)) {
      const seen = new Set<string>()
      return JSON.stringify([...b, ...a].filter((m) => !seen.has(JSON.stringify(m)) && !!seen.add(JSON.stringify(m))))
    }
    if (plain(a) && plain(b)) {
      const merged = Object.assign(Object.create(null) as Record<string, unknown>, a)
      for (const [k, v] of Object.entries(b)) {
        // 中もまた表なら、1段だけ合わせる（{ v: 1, items: {…} } のような形）
        merged[k] = plain(merged[k]) && plain(v) ? { ...merged[k], ...v } : v
      }
      return JSON.stringify(merged)
    }
  } catch {
    // JSON でなければ、戻す方を残す
  }
  return kept
}

// いまの人の記録を、この端末から消す（「ログアウトして、この端末の記録も消す」）。退避していた分も消す
export function forgetAccount(): void {
  const owner = loadOwner()
  for (const key of PERSONAL_KEYS) write(key, null)
  if (owner !== null) {
    const accounts = loadAccounts()
    delete accounts[owner]
    saveAccounts(accounts)
  }
  setOwner(LOGGED_OUT)
}

export function loadGithubToken(): string | null {
  const t = read(KEYS.githubToken)
  return t && t.trim() ? t.trim() : null
}

export function saveGithubToken(token: string | null): void {
  write(KEYS.githubToken, token)
}

// データを置く GitHub のリポジトリ（owner/name）。利用者が設定で決める。
// 通信の URL に入るので、読むときも入力のときも、この形のものだけを通す（owner は英数字とハイフン、name は英数字・ . _ -）
const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/

export function parseRepo(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const repo = value.trim()
  if (!REPO_PATTERN.test(repo)) return null
  // 「.」「..」は URL の経路として解釈されてしまうので除く
  const name = repo.split('/')[1]
  return name === '.' || name === '..' ? null : repo
}

export function loadGithubRepo(): string | null {
  return parseRepo(read(KEYS.githubRepo))
}

export function saveGithubRepo(repo: string | null): void {
  write(KEYS.githubRepo, repo)
}

// トークンとリポジトリの両方がそろったときだけ GitHub につながっているとみなす（片方だけなら端末だけで動く）
export function loadGithubConnection(): GithubConnection | null {
  const token = loadGithubToken()
  const repo = loadGithubRepo()
  return token && repo ? { token, repo } : null
}

// パスの記録そのものの検証は features/match/passes.ts の parsePasses が行う
export function loadPassesRaw(): unknown {
  return readJson(KEYS.passes)
}

export function savePassesRaw(value: unknown): void {
  write(KEYS.passes, JSON.stringify(value))
}

// マッチングの絞り込み条件の検証は features/match/matchFilter.ts の parseMatchFilter が行う
export function loadMatchFilterRaw(): unknown {
  return readJson(KEYS.matchFilter)
}

export function saveMatchFilterRaw(value: unknown): void {
  write(KEYS.matchFilter, JSON.stringify(value))
}

// バックアップの前回の結果の検証は features/backup/backupStore.ts の parseBackupStatus が行う
export function loadBackupStatusRaw(): unknown {
  return readJson(KEYS.backup)
}

export function saveBackupStatusRaw(value: unknown): void {
  write(KEYS.backup, JSON.stringify(value))
}

// 自分の感想の控えの検証は lib/myReviews.ts の parseReviewsSnapshot が行う
export function loadReviewsRaw(): unknown {
  return readJson(KEYS.reviews)
}

export function saveReviewsRaw(value: unknown): void {
  write(KEYS.reviews, JSON.stringify(value))
}

// 見たいの印とメモの検証は features/records/wannaNotes.ts が行う
export function loadWannaNotesRaw(): unknown {
  return readJson(KEYS.wannaNotes)
}

export function saveWannaNotesRaw(value: unknown): void {
  write(KEYS.wannaNotes, JSON.stringify(value))
}

// とっておいたライブラリとクールの作品の検証は lib/offlineCache.ts が行う
export function loadStoredLibraryRaw(): unknown {
  return readJson(KEYS.library)
}

export function saveStoredLibraryRaw(value: unknown): void {
  write(KEYS.library, JSON.stringify(value))
}

export function loadSeasonWorksRaw(): unknown {
  return readJson(KEYS.seasonWorks)
}

export function saveSeasonWorksRaw(value: unknown): void {
  write(KEYS.seasonWorks, JSON.stringify(value))
}

// 感想の下書きの検証は lib/reviewDrafts.ts が行う
export function loadReviewDraftsRaw(): unknown {
  return readJson(KEYS.reviewDrafts)
}

export function saveReviewDraftsRaw(value: unknown): void {
  write(KEYS.reviewDrafts, JSON.stringify(value))
}

export function clearReviewsRaw(): void {
  write(KEYS.reviews, null)
}

// 「Anipair の使い方」を見たか。{ v: 1, at: 見た日時 } の形のときだけ「見た」とみなす（壊れていれば、もう一度出す）
export function parseOnboardingSeen(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const { v, at } = value as Record<string, unknown>
  return v === 1 && typeof at === 'string'
}

export function loadOnboardingSeen(): boolean {
  return parseOnboardingSeen(readJson(KEYS.onboarding))
}

export function saveOnboardingSeen(seen: boolean): void {
  write(KEYS.onboarding, seen ? JSON.stringify({ v: 1, at: new Date().toISOString() }) : null)
}

// 「シートはタップで閉じます」の案内を見たか（形は使い方の案内と同じ）
export function loadSheetHintSeen(): boolean {
  return parseOnboardingSeen(readJson(KEYS.sheetHint))
}

export function saveSheetHintSeen(): void {
  write(KEYS.sheetHint, JSON.stringify({ v: 1, at: new Date().toISOString() }))
}

// キー割り当ての検証は lib/keymap.ts の parseKeymap が行う
// 称号まわり（形の確認は features/achievements/achievementStore.ts）
export function loadSeasonTopsRaw(): unknown {
  return readJson(KEYS.seasonTops)
}

export function saveSeasonTopsRaw(value: unknown): void {
  write(KEYS.seasonTops, JSON.stringify(value))
}

export function loadTitlesRaw(): unknown {
  return readJson(KEYS.titles)
}

export function saveTitlesRaw(value: unknown): void {
  write(KEYS.titles, JSON.stringify(value))
}

export function loadFeatsRaw(): unknown {
  return readJson(KEYS.feats)
}

export function saveFeatsRaw(value: unknown): void {
  write(KEYS.feats, JSON.stringify(value))
}

export type EffectLevel = 'full' | 'subtle' | 'off'

export function parseEffectLevel(value: unknown): EffectLevel {
  return value === 'subtle' || value === 'off' ? value : 'full'
}

export function loadEffectLevel(): EffectLevel {
  return parseEffectLevel(readJson(KEYS.effects))
}

export function saveEffectLevel(level: EffectLevel): void {
  write(KEYS.effects, JSON.stringify(level))
}

// ページの一番外の要素に印を付ける（styles/achievements.css の末尾が、これを見て演出を弱める）
export function applyEffectLevel(level: EffectLevel): void {
  if (typeof document === 'undefined') return
  if (level === 'full') delete document.documentElement.dataset.effects
  else document.documentElement.dataset.effects = level
}

export type ButtonLabels = 'both' | 'icon' | 'text'

export function parseButtonLabels(value: unknown): ButtonLabels {
  return value === 'icon' || value === 'text' ? value : 'both'
}

export function loadButtonLabels(): ButtonLabels {
  return parseButtonLabels(readJson(KEYS.buttonLabels))
}

export function saveButtonLabels(value: ButtonLabels): void {
  write(KEYS.buttonLabels, JSON.stringify(value))
}

// ページの一番外の要素に印を付ける（styles/base.css の [data-buttons] が、これを見てアイコンか名前を隠す）
export function applyButtonLabels(value: ButtonLabels): void {
  if (typeof document === 'undefined') return
  if (value === 'both') delete document.documentElement.dataset.buttons
  else document.documentElement.dataset.buttons = value
}

export function loadKeymapRaw(): unknown {
  return readJson(KEYS.keymap)
}

export function saveKeymapRaw(value: unknown): void {
  write(KEYS.keymap, JSON.stringify(value))
}

export function loadBackfillSeason(): Season | null {
  return parseSlug(read(KEYS.backfillSeason))
}

export function saveBackfillSeason(season: Season): void {
  write(KEYS.backfillSeason, toSlug(season))
}

// 「見てない」の記録そのものの検証は features/rate/unseen.ts の parseUnseen が行う
export function loadUnseenRaw(): unknown {
  return readJson(KEYS.unseen)
}

export function saveUnseenRaw(value: unknown): void {
  write(KEYS.unseen, JSON.stringify(value))
}

// 旧形式（Annict の作品 ID の配列）。保存が無ければ null
export function parseSkipped(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => Number.isInteger(v) && v > 0)
}

export function loadLegacySkippedRaw(): unknown {
  return readJson(KEYS.skipped)
}

export function clearLegacySkipped(): void {
  write(KEYS.skipped, null)
}

// 表紙。url は大きく出す画像（評価・マッチングのカードと詳細）、thumb は一覧の小さい画像。
// landscape は Annict の API の画像（公式サイトの横長の画像）で、縦長の枠では中央を切り取って出す（詳細だけは切らずに出す）
export interface Cover {
  url: string
  thumb: string
  landscape: boolean
}

// Shikimori のポスター（MyAnimeList の ID ごと）。o は大きい画像（約 700×1000）、m は小さい画像（225×318）
export interface Poster {
  o: string
  m: string
}

const isHttps = (v: unknown): v is string => typeof v === 'string' && /^https:\/\//.test(v)

export function parsePosters(value: unknown): Map<number, Poster> {
  const out = new Map<number, Poster>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { o, m } = v as Record<string, unknown>
    if (isHttps(o) && isHttps(m)) out.set(id, { o, m })
  }
  return out
}

export function loadPosters(): Map<number, Poster> {
  return parsePosters(readJson(KEYS.covers))
}

// 表紙の控えは、多くても POSTERS_MAX 件（端末の保存容量を分け合うため）。数字の鍵の JSON は入れた順を残さないので、
// 新しい作品ほど大きい Annict の ID の大きいものから残す
export const POSTERS_MAX = 4000

export function savePosters(posters: Map<number, Poster>): void {
  const kept = posters.size <= POSTERS_MAX ? [...posters] : [...posters].sort((a, b) => b[0] - a[0]).slice(0, POSTERS_MAX)
  write(KEYS.covers, JSON.stringify(Object.fromEntries(kept)))
}

// 前の版は表紙を animax.covers.v1 に控えていた。使わないので消す（いつ呼んでも害は無い）
export function clearLegacyCovers(): void {
  write(KEYS.legacyCovers, null)
}

// 似た作品の一覧の控え（MyAnimeList の ID ごと。at は取った時刻のミリ秒）。作品どうしの関係はほとんど変わらないので長く使い回す
export const SIMILAR_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SIMILAR_MAX_ENTRIES = 500

export interface SimilarEntry {
  at: number
  ids: number[]
}

// 形の壊れたもの・期限の切れたものは捨てる。多すぎるときは古いものから捨てる
export function parseSimilar(value: unknown, now: number): Map<number, SimilarEntry> {
  const out = new Map<number, SimilarEntry>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const id = Number(k)
    if (!Number.isInteger(id) || id <= 0 || !v || typeof v !== 'object') continue
    const { at, ids } = v as Record<string, unknown>
    if (typeof at !== 'number' || !Number.isFinite(at) || now - at >= SIMILAR_TTL_MS || at > now + 60_000) continue
    if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(n) && n > 0)) continue
    out.set(id, { at, ids: ids as number[] })
  }
  if (out.size <= SIMILAR_MAX_ENTRIES) return out
  return new Map([...out].sort((a, b) => b[1].at - a[1].at).slice(0, SIMILAR_MAX_ENTRIES))
}

export function loadSimilar(now: number = Date.now()): Map<number, SimilarEntry> {
  return parseSimilar(readJson(KEYS.similar), now)
}

export function saveSimilar(entries: Map<number, SimilarEntry>): void {
  write(KEYS.similar, JSON.stringify(Object.fromEntries(entries)))
}

// 「Annict でログイン」の state（なりすましの確認用）。ログイン画面へ行って戻ってくるまでの間だけ、そのタブの sessionStorage に置く
const OAUTH_STATE_KEY = 'animax.annictOauthState'

export function loadOauthState(): string | null {
  try {
    return sessionStorage.getItem(OAUTH_STATE_KEY)
  } catch {
    return null
  }
}

export function saveOauthState(state: string | null): void {
  try {
    if (state === null) sessionStorage.removeItem(OAUTH_STATE_KEY)
    else sessionStorage.setItem(OAUTH_STATE_KEY, state)
  } catch {
    // 保存できない環境では、ログインの照合ができず、戻ってきたときに断られる
  }
}

// この端末の保存を全部消す（画面が壊れたときの「消して再読み込み」）。消したあとは読み込み直すので、以降は何も書かない。
// 1つずつ write で消すと、最初にトークンを消した時点でこのページが「古い」になり、残りが消えなかった（2026-10-06 のセキュリティの点検）
export function clearAll(): void {
  if (frozen) return
  for (const k of ALL_KEYS) {
    try {
      localStorage.removeItem(k)
    } catch {
      // 消せない環境では何もしない
    }
  }
  frozen = true
}

export function loadWriteJournalRaw(): unknown {
  return readJson(KEYS.writeJournal)
}

export function saveWriteJournalRaw(value: unknown): void {
  write(KEYS.writeJournal, value === null ? null : JSON.stringify(value))
}

export function loadUncertainWritesRaw(): unknown {
  return readJson(KEYS.uncertainWrites)
}

export function saveUncertainWritesRaw(value: unknown): void {
  write(KEYS.uncertainWrites, value === null ? null : JSON.stringify(value))
}

export function loadStillWatchingRaw(): unknown {
  return readJson(KEYS.stillWatching)
}

export function saveStillWatchingRaw(value: unknown): void {
  write(KEYS.stillWatching, value === null ? null : JSON.stringify(value))
}

export function loadEpisodeDraftsRaw(): unknown {
  return readJson(KEYS.episodeDrafts)
}

export function saveEpisodeDraftsRaw(value: unknown): void {
  write(KEYS.episodeDrafts, value === null ? null : JSON.stringify(value))
}
