import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CoverImage } from '../../components/CoverImage'
import { Empty } from '../../components/Empty'
import { CloseIcon } from '../../components/Icons'
import { Sheet } from '../../components/Sheet'
import { useSheetLayer } from '../../components/sheetLayer'
import type { GithubConnection } from '../../lib/github'
import { t } from '../../lib/i18n'
import { fetchCovers, quickCovers } from '../../lib/covers'
import { seasonLabel, seasonNameLabel, seasonOf } from '../../lib/season'
import type { Cover } from '../../lib/storage'
import { useCoalescedTask } from '../../lib/useCoalescedTask'
import { useModalFocus } from '../../lib/useModalFocus'
import type { RecordRow } from '../records/recordList'
import { TierBoard, TierSort } from './TierBoard'
import { TierPick } from './TierPick'
import { TierShareSheet } from './TierShareSheet'
import {
  TABLE_MAX,
  TIER_MAX,
  TIER_MIN,
  TIER_NAME_MAX,
  TITLE_MAX,
  addTier,
  candidates,
  createPickedTable,
  createTable,
  removeTier,
  renameTable,
  pickedRow,
  renameTier,
  settle,
  tierColor,
  viewOf,
  type TierScope,
  type TierStore,
  type TierTable,
  type TierWork,
} from './tierList'
import { genreName } from '../match/taste'
import { PICK_GENRES, PICK_STUDIOS, axisTable, type PickPreset, type TableAxis } from './tierPicking'
import { deleteShare } from './tierShare'
import { loadLocalTiers, newTableId, removeTable, saveTable, syncTiers } from './tierStore'

// 記録の「まとめ ▸ Tier表」。表は5つまで。端末に控え、GitHub と連携していれば tiers.json と同期する。
// 最初の表は「Tier表を作る」から択一の質問を1つずつ進めて、見た作品すべてで作る（TierSetup）。
// 2つめからは「新しい表」で何の表か（見たい作品・今期・ジャンル・制作会社・自分で選ぶ）を聞いて空の表を作り、
// その絞り込みで作品を足すシート（TierPick）を開く（TierNewAsk）。表が2つ以上なら、開いたときは表を並べて選ばせる

// 動かすたびに GitHub の1コミットにしないよう、操作が止まってから送る
const SYNC_DELAY = 8000

// 最初の表で選べる段の数。4段は Annict の4段階そのまま
const FIRST_COUNTS = [4, 5, 6, 7] as const

const ALL: TierScope = { kind: 'all' }

// 範囲の短い名前（「2026年 秋」「2024〜2026年 春・夏」「2020年〜」「春・夏」）。すべてなら null
function rangeText(scope: TierScope): string | null {
  if (scope.kind === 'all' || scope.kind === 'picked') return null
  if (scope.kind === 'year') return t(`${scope.year}年`, String(scope.year))
  if (scope.kind === 'cour') return seasonLabel(scope)
  const { from, to } = scope
  const years =
    from !== null && to !== null
      ? from === to
        ? t(`${from}年`, String(from))
        : t(`${from}〜${to}年`, `${from}–${to}`)
      : from !== null
        ? t(`${from}年〜`, `${from} onward`)
        : to !== null
          ? t(`〜${to}年`, `through ${to}`)
          : ''
  const seasons = scope.seasons.map(seasonNameLabel).join(t('・', ', '))
  return t(`${years} ${seasons}`, `${seasons} ${years}`).trim()
}

function scopeLabel(scope: TierScope): string {
  if (scope.kind === 'picked') return t('選んだ作品', 'Picked anime')
  const range = rangeText(scope)
  return range === null ? t('見た作品すべて', 'All watched anime') : t(`${range}のアニメ`, `${range} anime`)
}

// 選んだ表のうち記録に無い作品の行（表紙を読んで足す）。どの表の作品も1つの並びにまとめ、記録の行と同じように扱う
function usePickedRows(tables: readonly TierTable[], records: readonly RecordRow[]): RecordRow[] {
  const works = useMemo(() => {
    const have = new Set(records.map((r) => r.entry.annictId))
    const out = new Map<number, TierWork>()
    for (const w of tables.flatMap((x) => x.works ?? [])) if (!have.has(w.annictId)) out.set(w.annictId, w)
    return [...out.values()]
  }, [tables, records])
  const [covers, setCovers] = useState<ReadonlyMap<number, Cover>>(new Map())
  const asked = useRef(new Set<number>())
  useEffect(() => {
    const list = works.filter((w) => !asked.current.has(w.annictId))
    if (list.length === 0) return
    for (const w of list) asked.current.add(w.annictId)
    const merge = (got: ReadonlyMap<number, Cover>) => setCovers((cur) => new Map([...cur, ...got]))
    merge(quickCovers(list))
    void fetchCovers(list, { onProgress: merge }).then(merge)
  }, [works])
  return useMemo(() => works.map((w) => ({ ...pickedRow(w), cover: covers.get(w.annictId) ?? null })), [works, covers])
}

export function TierView(props: {
  token: string
  rows: readonly RecordRow[]
  github: GithubConnection | null
  enqueue: (label: string, task: () => Promise<void>) => void
  active: boolean
  onOpen: (row: RecordRow) => void
}) {
  const [store, setStore] = useState(() => loadLocalTiers())
  const [pickedId, setPickedId] = useState<string | null>(null)
  // 作品を足すシートを開いている。preset は新しい表を作った直後の絞り込み
  const [adding, setAdding] = useState(false)
  const [preset, setPreset] = useState<PickPreset | null>(null)
  // 新しい表を「何の表か」から作っている
  const [asking, setAsking] = useState(false)
  const [editing, setEditing] = useState(false)
  const [sharing, setSharing] = useState(false)
  // まだ置いていない作品を1枚ずつ振り分けている
  const [sorting, setSorting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // 表が1つならその表をすぐ出す。2つ以上なら、選ぶまでは表を並べて見せる（TierShelf）
  const stored = store.tables.find((x) => x.id === pickedId) ?? (store.tables.length === 1 ? store.tables[0] : null)
  // あとから見た・評価した作品を評価どおりに置いた表（置いたら下で保存する）
  const picked = usePickedRows(store.tables, props.rows)
  const rows = useMemo(() => (picked.length > 0 ? [...props.rows, ...picked] : props.rows), [props.rows, picked])
  const table = useMemo(() => (stored ? settle(stored, rows) : null), [stored, rows])
  const view = useMemo(() => (table ? viewOf(table, rows) : null), [table, rows])

  // GitHub との同期（開いたとき・変えて少し経ったとき・離れたとき）
  const { github, active } = props
  const sync = useMemo(() => (github ? async () => setStore(await syncTiers(github)) : null), [github])
  const syncLater = useCoalescedTask(props.enqueue, t('Tier表をGitHubに保存', 'Saving tier lists to GitHub'), sync)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flush = useRef<(() => void) | null>(null)
  useEffect(() => {
    flush.current = () => {
      if (!timer.current) return
      clearTimeout(timer.current)
      timer.current = null
      syncLater()
    }
  }, [syncLater])
  const syncedWith = useRef<GithubConnection | null>(null)
  useEffect(() => {
    if (!active || !github || syncedWith.current === github) return
    syncedWith.current = github
    syncLater()
  }, [active, github, syncLater])
  useEffect(() => {
    if (!active) flush.current?.()
  }, [active])
  useEffect(() => () => flush.current?.(), [])

  const commit = (next: TierStore) => {
    setStore(next)
    if (!sync) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flush.current?.(), SYNC_DELAY)
  }
  const change = (next: TierTable) => commit(saveTable(next))
  const changeRef = useRef(change)
  useEffect(() => {
    changeRef.current = change
  })
  useEffect(() => {
    if (table && table !== stored) changeRef.current(table)
  }, [table, stored])

  const newButton = store.tables.length < TABLE_MAX && (
    <button type="button" className="btn" onClick={() => setAsking(true)}>
      {t('＋ 新しい表', '+ New list')}
    </button>
  )
  const newAsk = asking && (
    <TierNewAsk
      rows={props.rows}
      active={props.active}
      onCreate={(axis) => {
        // 空の表を作り、すぐ答えに合わせた絞り込みで作品を足すシートを開く（題名は仮。表の設定で変える）
        const made = axisTable(axis, store.tables.length + 1)
        const created = createPickedTable({ id: newTableId(), title: made.title })
        commit(saveTable(created))
        setAsking(false)
        setPickedId(created.id)
        setPreset(made.preset)
        setAdding(true)
      }}
      onCancel={() => setAsking(false)}
    />
  )

  if (store.tables.length >= 2 && (!table || !view)) {
    return (
      <div className="summary tierview">
        <TierShelf tables={store.tables} rows={rows} onPick={setPickedId} />
        {newButton && <div className="tiershelf__new">{newButton}</div>}
        {newAsk}
      </div>
    )
  }

  if (!table || !view) {
    if (candidates(props.rows, { scope: ALL, includeDropped: false }).length === 0) {
      return (
        <div className="summary">
          <Empty
            title={t('見た作品がまだありません', 'No watched anime yet')}
            body={t('「見た」か「見てる」にした作品をTier表に並べられます。', 'Anime you mark as Watched or Watching can go on a tier list.')}
          />
        </div>
      )
    }
    return (
      <TierSetup
        rows={props.rows}
        active={props.active}
        onCreate={(created, sortNow) => {
          commit(saveTable(created))
          setPickedId(created.id)
          setSorting(sortNow)
        }}
      />
    )
  }

  return (
    <div ref={rootRef} className="summary tierview">
      <div className="tierview__tables">
        {store.tables.length >= 2 ? (
          <button type="button" className="link tierview__back" onClick={() => setPickedId(null)}>
            {t('‹ Tier表の一覧', '‹ All tier lists')}
          </button>
        ) : (
          newButton || <span />
        )}
        <div className="tierview__actions">
          {table.scope.kind === 'picked' && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPreset(null)
                setAdding(true)
              }}
            >
              {t('＋ 作品を足す', '+ Add anime')}
            </button>
          )}
          <button type="button" className="btn" onClick={() => setSharing(true)}>
            {t('リンクで共有', 'Share as a link')}
          </button>
          <button type="button" className="btn" onClick={() => setEditing(true)}>
            {t('表の設定', 'List settings')}
          </button>
        </div>
      </div>
      {table.scope.kind === 'picked' && (table.works ?? []).length === 0 && (
        // 足すボタンは上の「＋ 作品を足す」だけ（作品が入っても同じ場所に残る）
        <p className="note tierview__empty">
          {t(
            'この表にはまだ作品がありません。上の「＋ 作品を足す」から、作品名で探すか、人気の順・ジャンル・制作会社・自分のリストから選んで足せます。',
            'This list has no anime yet. Use “+ Add anime” above to search by title, or pick from popular anime, genres, studios or your lists.',
          )}
        </p>
      )}

      <p className="note tierview__scope">
        {t(
          `${scopeLabel(table.scope)}。表紙を引くと（スマホは長押ししてから）好きな段と位置へ動かせます。表紙を押すと作品の詳細が開きます。ここで動かしても、Annictの評価は変わりません。`,
          `${scopeLabel(table.scope)}. Drag a cover (on a phone, press and hold first) to move it to any tier and position. Tap a cover for details. Moving them here doesn’t change your Annict ratings.`,
        )}
      </p>

      {/* 置いていない作品の欄は表の下にあり、作品が多いと何画面も先になる。表の上にも本数と入口を出す */}
      {view.unplaced.length > 0 && (
        <section className="tierlater" aria-label={t('まだ置いていない', 'Not placed yet')}>
          <p className="tierpool__title">
            {t('まだ置いていない', 'Not placed yet')}
            <span className="rhead__count">{view.unplaced.length}</span>
          </p>
          <div className="tierlater__acts">
            <button type="button" className="btn" onClick={() => setSorting(true)}>
              {t('1枚ずつ振り分ける', 'Place one by one')}
            </button>
            <button type="button" className="link" onClick={() => rootRef.current?.querySelector('.tierpool')?.scrollIntoView({ block: 'start' })}>
              {t('一覧へ ↓', 'See them ↓')}
            </button>
          </div>
        </section>
      )}

      <TierBoard table={table} view={view} active={props.active} onChange={change} onOpen={props.onOpen} />

      {sorting && <TierSort table={table} view={view} active={props.active} onChange={change} onClose={() => setSorting(false)} />}

      {adding && <TierPick token={props.token} rows={props.rows} table={table} preset={preset} active={props.active} onChange={change} onClose={() => setAdding(false)} />}

      {newAsk}

      {sharing && <TierShareSheet table={table} view={view} active={props.active} onChange={change} onClose={() => setSharing(false)} />}

      {editing && (
        <TierSettings
          table={table}
          active={props.active}
          onChange={change}
          onRemove={async () => {
            // 共有のリンクも消す（鍵は表と一緒に消えるので、あとから消せなくなる）。消せなければ表も残す
            if (table.share) {
              const r = await deleteShare(table.share)
              if (!r.ok) return r.message
            }
            commit(removeTable(table.id))
            setPickedId(null)
            setEditing(false)
            return null
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

// 表が2つ以上のときの一覧。どの表かは題名と、段の色に表紙を並べた小さな見本で分かるようにする。押すとその表を開く
function TierShelf(props: { tables: readonly TierTable[]; rows: readonly RecordRow[]; onPick: (id: string) => void }) {
  return (
    <ul className="tiershelf" aria-label={t('Tier表', 'Tier lists')}>
      {props.tables.map((x) => (
        <li key={x.id}>
          <TierShelfCard table={x} rows={props.rows} onPick={() => props.onPick(x.id)} />
        </li>
      ))}
    </ul>
  )
}

// 見本の1段に並べる表紙の数（それより多い分はカードの幅で切れる）
const SHELF_TILES = 12

function TierShelfCard(props: { table: TierTable; rows: readonly RecordRow[]; onPick: () => void }) {
  const view = useMemo(() => viewOf(settle(props.table, props.rows), props.rows), [props.table, props.rows])
  const title = props.table.title || scopeLabel(props.table.scope)
  const placed = view.tiers.reduce((n, tier) => n + tier.rows.length, 0)
  return (
    <button type="button" className="tiershelf__card" onClick={props.onPick}>
      <span className="tiershelf__title">{title}</span>
      <span className="tiershelf__meta">
        {scopeLabel(props.table.scope)}
        {' · '}
        {view.unplaced.length > 0
          ? t(`置いた ${placed}・まだ置いていない ${view.unplaced.length}`, `${placed} placed, ${view.unplaced.length} not yet`)
          : t(`${placed}本`, `${placed} anime`)}
      </span>
      <span className="tiershelf__board" aria-hidden>
        {view.tiers.map((tier, i) => (
          <span key={i} className="tiershelf__row">
            <span className="tiershelf__label" style={{ background: tierColor(i, view.tiers.length) }}>
              {tier.name}
            </span>
            <span className="tiershelf__tiles">
              {tier.rows.slice(0, SHELF_TILES).map((r) => (
                <span key={r.entry.annictId} className="tiershelf__tile">
                  {r.cover && <CoverImage cover={r.cover} size="thumb" lazy />}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </button>
  )
}

// 択一の質問を、画面の中央に重ねて出す。押したらすぐ次へ進む（「これで決定」は置かない）。
// 後ろの表は見えたまま流せる（段の数は後ろの見本を見て選ぶ）。背景を押しても閉じない（押し間違いで流れが消えないように）。✕ か Esc でやめる
function TierAsk(props: {
  question: string
  choices: { label: string; sub?: string; primary?: boolean; onChoose: () => void }[]
  // row: 短い選択肢を横に並べる（段の数）。chips: 多い選択肢を折り返して並べ、収まらなければ流す（ジャンル・制作会社）
  row?: boolean
  chips?: boolean
  active: boolean
  onBack?: () => void
  onCancel: () => void
}) {
  const layer = useSheetLayer()
  const ref = useRef<HTMLDivElement>(null)
  useModalFocus(ref, props.active)
  // 質問が替わるたびに、最初の選択肢へフォーカスを置く
  useEffect(() => {
    if (props.active) ref.current?.querySelector<HTMLElement>('.tierask__pick')?.focus({ preventScroll: true })
  }, [props.question, props.active])
  const cancel = useRef(props.onCancel)
  useEffect(() => {
    cancel.current = props.onCancel
  })
  useEffect(() => {
    if (!props.active) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel.current()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [props.active])
  if (!props.active) return null
  return createPortal(
    <div className="tierask-backdrop">
      <div ref={ref} className="tierask" role="dialog" aria-modal="true" aria-label={props.question}>
        {/* 質問は中央、右上に閉じる（左は閉じると同じ幅を空けて、中央からずらさない）。戻るは右下 */}
        <div className="tierask__head">
          <span />
          <p className="tierask__question">{props.question}</p>
          <button type="button" className="tierask__icon" onClick={props.onCancel} aria-label={t('作るのをやめる', 'Stop making')}>
            <CloseIcon />
          </button>
        </div>
        <div className={props.chips ? 'tierask__choices tierask__choices--chips' : props.row ? 'tierask__choices tierask__choices--row' : 'tierask__choices'}>
          {props.choices.map((c) => (
            <button key={c.label} type="button" className={c.primary ? 'tierask__pick tierask__pick--primary' : 'tierask__pick'} onClick={c.onChoose}>
              <span>{c.label}</span>
              {c.sub && <span className="tierask__sub">{c.sub}</span>}
            </button>
          ))}
        </div>
        {props.onBack && (
          <div className="tierask__foot">
            <button type="button" className="btn" onClick={props.onBack}>
              {t('戻る', 'Back')}
            </button>
          </div>
        )}
      </div>
    </div>,
    layer,
  )
}

// 2つめからの表を作る質問: 何の表か → （ジャンル・制作会社なら）どれか。答えると空の表を作り、その絞り込みで作品を足すシートを開く
function TierNewAsk(props: { rows: readonly RecordRow[]; active: boolean; onCreate: (axis: TableAxis) => void; onCancel: () => void }) {
  const [step, setStep] = useState<'kind' | 'genre' | 'studio'>('kind')
  const season = useMemo(() => seasonOf(new Date()), [])
  const wanna = props.rows.filter((r) => r.entry.state === 'WANNA_WATCH').length
  if (step === 'genre') {
    return (
      <TierAsk
        question={t('どのジャンルの表にしますか', 'Which genre?')}
        chips
        choices={PICK_GENRES.map((g) => ({ label: genreName(g), onChoose: () => props.onCreate({ kind: 'genre', genre: g }) }))}
        active={props.active}
        onBack={() => setStep('kind')}
        onCancel={props.onCancel}
      />
    )
  }
  if (step === 'studio') {
    return (
      <TierAsk
        question={t('どの制作会社の表にしますか', 'Which studio?')}
        chips
        choices={PICK_STUDIOS.map((s) => ({ label: s.label, onChoose: () => props.onCreate({ kind: 'studio', studio: s }) }))}
        active={props.active}
        onBack={() => setStep('kind')}
        onCancel={props.onCancel}
      />
    )
  }
  return (
    <TierAsk
      question={t('何の表を作りますか', 'What is this list of?')}
      choices={[
        ...(wanna > 0 ? [{ label: t('見たい作品', 'Want to watch'), sub: t(`見たいの${wanna}本から`, `From your ${wanna} anime`), onChoose: () => props.onCreate({ kind: 'wanna' }) }] : []),
        { label: t('今期のアニメ', 'This season'), sub: seasonLabel(season), onChoose: () => props.onCreate({ kind: 'season', season }) },
        { label: t('ジャンルで', 'By genre'), sub: t('恋愛・SF・異世界など', 'Romance, sci-fi, isekai…'), onChoose: () => setStep('genre') },
        { label: t('制作会社で', 'By studio'), sub: t('MAPPA・京都アニメーションなど', 'MAPPA, Kyoto Animation…'), onChoose: () => setStep('studio') },
        { label: t('自分で選ぶ', 'Pick my own'), sub: t('作品名で探して足す', 'Search and add by title'), onChoose: () => props.onCreate({ kind: 'free' }) },
      ]}
      active={props.active}
      onCancel={props.onCancel}
    />
  )
}

// 最初の表を作る流れ: 「Tier表を作る」→ 仮に置くか自分で置くか → 何段か（後ろに見本の表）→ 評価のない作品を振り分けるか。
// 最後の質問に答えたときに保存する（それまではどの質問にも戻れる）。sortNow は「振り分ける」を選んだか
function TierSetup(props: { rows: readonly RecordRow[]; active: boolean; onCreate: (table: TierTable, sortNow: boolean) => void }) {
  const [step, setStep] = useState<'start' | 'how' | 'count' | 'sort'>('start')
  const [manual, setManual] = useState(false)
  const [count, setCount] = useState<number>(FIRST_COUNTS[0])
  const [id] = useState(() => newTableId())
  const make = (n: number) => createTable(props.rows, { id, title: t('アニメ Tier表', 'Anime tier list'), scope: ALL, includeDropped: false, count: n, manual })
  const pool = candidates(props.rows, { scope: ALL, includeDropped: false })
  const rated = pool.filter((r) => r.review?.ratingOverallState).length
  const cancel = () => setStep('start')

  if (step === 'start' || step === 'how') {
    const choose = (m: boolean) => {
      setManual(m)
      setStep('count')
    }
    return (
      <div className="summary tiersetup">
        <Empty mood="propose" title={t('見た作品でTier表を作る', 'Make a tier list of what you watched')} body={t(`見た作品 ${pool.length}本`, `${pool.length} watched`)}>
          <button type="button" className="btn btn--primary" onClick={() => setStep('how')}>
            {t('Tier表を作る', 'Make a tier list')}
          </button>
        </Empty>
        {step === 'how' && (
          <TierAsk
            question={t('どう並べ始めますか', 'How do you want to start?')}
            choices={[
              { label: t('Annictの評価で仮に置く', 'Start from my Annict ratings'), sub: t(`評価のある${rated}本を置いた表から`, `${rated} rated anime placed for you`), primary: true, onChoose: () => choose(false) },
              { label: t('全部自分で置く', 'Place everything myself'), sub: t(`${pool.length}本を自分で`, `All ${pool.length} by hand`), onChoose: () => choose(true) },
            ]}
            active={props.active}
            onCancel={cancel}
          />
        )}
      </div>
    )
  }

  // 後ろの見本。段の数を選ぶまでは4段、選んだあとはその段の数。動かせない（動かすのは作ってから）
  const preview = make(step === 'count' ? FIRST_COUNTS[0] : count)
  const unplaced = viewOf(preview, props.rows).unplaced.length
  const pickCount = (n: number) => {
    setCount(n)
    const table = make(n)
    if (viewOf(table, props.rows).unplaced.length > 0) setStep('sort')
    else props.onCreate(table, false)
  }
  return (
    <div className="summary tiersetup">
      <div className="tiersetup__preview" inert>
        <TierBoard table={preview} view={viewOf(preview, props.rows)} active={false} onChange={() => {}} onOpen={() => {}} />
      </div>
      {step === 'count' ? (
        <TierAsk
          question={t('何段で作りますか', 'How many tiers?')}
          row
          choices={FIRST_COUNTS.map((n) => ({
            label: t(`${n}段`, `${n} tiers`),
            sub: n === FIRST_COUNTS[0] && !manual ? t('このまま', 'As shown') : undefined,
            primary: n === FIRST_COUNTS[0],
            onChoose: () => pickCount(n),
          }))}
          active={props.active}
          onBack={() => setStep('how')}
          onCancel={cancel}
        />
      ) : (
        <TierAsk
          question={manual ? t(`置く作品が${unplaced}本あります`, `${unplaced} anime to place`) : t(`評価のない作品が${unplaced}本あります`, `${unplaced} anime have no rating`)}
          choices={[
            { label: t('振り分ける', 'Place them now'), primary: true, onChoose: () => props.onCreate(preview, true) },
            { label: t('あとで', 'Later'), onChoose: () => props.onCreate(preview, false) },
          ]}
          active={props.active}
          onBack={() => setStep('count')}
          onCancel={cancel}
        />
      )}
    </div>
  )
}

// 表の設定: 題名・段の数（＋−）・段の名前・視聴中断を入れるか・表を消す
function TierSettings(props: {
  table: TierTable
  active: boolean
  onChange: (table: TierTable) => void
  // 消せなかったときは利用者に見せる文
  onRemove: () => Promise<string | null>
  onClose: () => void
}) {
  const { table } = props
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    setRemoving(true)
    setError(null)
    const message = await props.onRemove()
    setRemoving(false)
    setError(message)
  }
  return (
    <Sheet label={t('表の設定', 'List settings')} active={props.active} onClose={props.onClose}>
      <div className="tiersettings">
        <label className="tiersettings__field">
          <span>{t('題名', 'Title')}</span>
          <input
            type="text"
            defaultValue={table.title}
            maxLength={TITLE_MAX}
            onBlur={(e) => e.target.value.trim() !== table.title && props.onChange(renameTable(table, e.target.value))}
          />
        </label>

        <div className="tiersettings__count">
          <span>{t(`段の数 ${table.tiers.length}`, `Tiers: ${table.tiers.length}`)}</span>
          <button type="button" className="btn" onClick={() => props.onChange(removeTier(table))} disabled={table.tiers.length <= TIER_MIN} aria-label={t('段を減らす', 'Remove a tier')}>
            −
          </button>
          <button type="button" className="btn" onClick={() => props.onChange(addTier(table))} disabled={table.tiers.length >= TIER_MAX} aria-label={t('段を増やす', 'Add a tier')}>
            +
          </button>
        </div>
        <p className="note">{t('段は下に増え、下から減ります。減らした段の作品は「まだ置いていない」に戻ります。', 'Tiers are added and removed at the bottom. Anime in a removed tier go back to “Not placed yet”.')}</p>

        <ol className="tiersettings__names">
          {table.tiers.map((tier, i) => (
            <li key={`${i}:${tier.name}`}>
              <input
                type="text"
                defaultValue={tier.name}
                maxLength={TIER_NAME_MAX}
                aria-label={t(`${i + 1}段目の名前`, `Name of tier ${i + 1}`)}
                onBlur={(e) => e.target.value.trim() !== tier.name && props.onChange(renameTier(table, i, e.target.value))}
              />
            </li>
          ))}
        </ol>

        {table.scope.kind !== 'picked' && (
        <label className="tiersettings__check">
          <input type="checkbox" checked={table.includeDropped} onChange={(e) => props.onChange({ ...table, includeDropped: e.target.checked, updatedAt: new Date().toISOString() })} />
          {t('視聴中断の作品も入れる', 'Include dropped anime')}
        </label>
        )}

        <div className="tiersettings__danger">
          {confirming ? (
            <>
              <p className="note">
                {table.share
                  ? t('この表と、共有のリンクを消します。元に戻せません。', 'This list and its share link will be deleted. This can’t be undone.')
                  : t('この表を消します。元に戻せません。', 'This list will be deleted. This can’t be undone.')}
              </p>
              <button type="button" className="btn btn--danger" onClick={remove} disabled={removing}>
                {t('消す', 'Delete')}
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                {t('やめる', 'Cancel')}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirming(true)}>
              {t('この表を消す', 'Delete this list')}
            </button>
          )}
          {error && (
            <p className="note tiershare__error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  )
}
