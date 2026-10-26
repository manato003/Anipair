import { useState, type MouseEvent } from 'react'
import { CloseIcon } from '../../components/Icons'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { t } from '../../lib/i18n'
import { workTitle } from '../../lib/names'
import type { RecordRow } from '../records/recordList'
import { exclude, insert, place, restorePlacement, shift, tierColor, type TierTable, type TierView } from './tierList'
import { useTierDrag, type TierDrop } from './useTierDrag'

// Tier表の本体。表紙を引いて（スマホは長押しして）好きな段・位置へ落とす。表紙を押すと作品の詳細を開く。
// キーボード・読み上げでは、表紙を押すと選び、下の帯の段のボタン（か段の名前）で動かす。段の中は「左へ」「右へ」。
// 表に合わない作品は「表に入れない作品」へ（いちばん下に閉じて置き、開くと戻せる）。
// 撮ればそのまま投稿できる見た目にする（5段・7段がスマホの1画面に収まる大きさ）。撮影を促す文言は置かない
export function TierBoard(props: { table: TierTable; view: TierView; active: boolean; onChange: (table: TierTable) => void; onOpen: (row: RecordRow) => void }) {
  const { table, view } = props
  const [selected, setSelected] = useState<number | null>(null)
  const [sorting, setSorting] = useState(false)
  const count = view.tiers.length

  const all = [...view.tiers.flatMap((tier) => tier.rows), ...view.unplaced]
  const selectedRow = selected === null ? null : (all.find((r) => r.entry.annictId === selected) ?? null)
  const tierOf = (id: number) => view.tiers.findIndex((tier) => tier.rows.some((r) => r.entry.annictId === id))
  const selectedTier = selectedRow ? tierOf(selectedRow.entry.annictId) : -1

  const moveTo = (tier: number | null) => {
    if (!selectedRow) return
    props.onChange(place(table, selectedRow.entry.annictId, tier))
  }
  const nudge = (delta: -1 | 1) => {
    if (!selectedRow || selectedTier < 0) return
    props.onChange(shift(table, selectedRow.entry.annictId, delta, view.tiers[selectedTier].rows.map((r) => r.entry.annictId)))
  }
  const toggle = (row: RecordRow) => setSelected((cur) => (cur === row.entry.annictId ? null : row.entry.annictId))
  // マウスと指で押したら詳細を開く。キーボード・読み上げで押したとき（detail が 0）は選んで帯を出す（引いて動かせないため）
  const tile = (row: RecordRow) => (
    <Tile key={row.entry.annictId} row={row} selected={row.entry.annictId === selected} onClick={(e) => (e.detail === 0 ? toggle(row) : props.onOpen(row))} />
  )

  // 引いて落とした先へ入れる。同じ位置なら何もしない
  const dragRef = useTierDrag((id: number, drop: TierDrop) => {
    const from = tierOf(id)
    if (drop.tier === 'out') {
      if (!table.excluded?.includes(id)) props.onChange(exclude(table, id))
      return
    }
    if (drop.tier === null) {
      if (from >= 0 || table.excluded?.includes(id)) props.onChange(place(table, id, null))
      return
    }
    if (from === drop.tier) {
      const ids = view.tiers[from].rows.map((r) => r.entry.annictId)
      if ((ids[ids.indexOf(id) + 1] ?? null) === drop.before) return
    }
    props.onChange(insert(table, id, drop.tier, drop.before))
  })

  const position = selectedRow && selectedTier >= 0 ? view.tiers[selectedTier].rows.findIndex((r) => r.entry.annictId === selectedRow.entry.annictId) : -1

  return (
    <div ref={dragRef} className="tierdnd">
      <div className="tierboard">
        {table.title && <h3 className="tierboard__title">{table.title}</h3>}
        {view.tiers.map((tier, i) => (
          <div key={i} className="tierrow" data-tier={i}>
            {selectedRow ? (
              <button
                type="button"
                className="tierrow__label"
                style={{ background: tierColor(i, count) }}
                onClick={() => moveTo(i)}
                aria-label={t(`「${tier.name}」へ動かす`, `Move to “${tier.name}”`)}
              >
                {tier.name}
              </button>
            ) : (
              <span className="tierrow__label" style={{ background: tierColor(i, count) }}>
                {tier.name}
              </span>
            )}
            <ul className="tierrow__items" aria-label={tier.name}>
              {tier.rows.map(tile)}
            </ul>
          </div>
        ))}
        <p className="tierboard__mark">Anipair</p>
      </div>

      <section className="tierpool" data-tier="pool">
        <div className="tierpool__head">
          <h3 className="tierpool__title">
            {t('まだ置いていない', 'Not placed yet')}
            <span className="rhead__count">{view.unplaced.length}</span>
          </h3>
          {view.unplaced.length > 0 && (
            <button type="button" className="btn" onClick={() => setSorting(true)}>
              {t('1枚ずつ振り分ける', 'Place one by one')}
            </button>
          )}
        </div>
        {view.unplaced.length === 0 ? (
          <p className="note">{t('まだ置いていない作品はありません。', 'Every anime is placed.')}</p>
        ) : (
          <>
            {!table.manual && (
            <p className="note tierpool__note">
              {t(
                'Annictで評価を付けていない作品と、段から外した作品です。評価を付けた作品は、その評価の段へ自動で置きます。',
                'Anime you haven’t rated on Annict, and anime you took off the list. Rated anime are placed in their tier automatically.',
              )}
            </p>
            )}
            <ul className="tierrow__items tierpool__items">{view.unplaced.map(tile)}</ul>
          </>
        )}
      </section>

      <details className="tierout" data-tier="out">
        <summary className="tierout__head">
          {t('表に入れない作品', 'Left out of this list')}
          <span className="rhead__count">{view.excluded.length}</span>
        </summary>
        {view.excluded.length === 0 ? (
          <p className="note">
            {t(
              '表紙をここへ引いてくるか、「1枚ずつ振り分ける」の「表に入れない」で、この表から外せます。共有のリンクには出ません。',
              'Drag a cover here, or choose “Leave out” in “Place one by one”, to leave it out of this list. It won’t appear in the shared link.',
            )}
          </p>
        ) : (
          <ul className="tierout__items">
            {view.excluded.map((row) => (
              <li key={row.entry.annictId} className="tierout__item">
                <TileButton row={row} selected={false} onClick={() => props.onOpen(row)} />
                <span className="tierout__name">{workTitle(row.entry)}</span>
                <button type="button" className="btn" onClick={() => props.onChange(place(table, row.entry.annictId, null))}>
                  {t('戻す', 'Put back')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* 帯が一覧の最後を隠さないよう、帯のあいだは下に余白を足す */}
      {selectedRow && <div className="tierbar__spacer" aria-hidden />}
      {selectedRow && (
        <div className="tierbar" role="group" aria-label={t('選んだ作品を動かす', 'Move the selected anime')}>
          <div className="tierbar__head">
            <span className="tierbar__name">{workTitle(selectedRow.entry)}</span>
            <button type="button" className="link" onClick={() => props.onOpen(selectedRow)}>
              {t('詳細', 'Details')}
            </button>
            <button type="button" className="tierbar__close" onClick={() => setSelected(null)} aria-label={t('選ぶのをやめる', 'Deselect')}>
              <CloseIcon />
            </button>
          </div>
          <div className="tierbar__tiers">
            {view.tiers.map((tier, i) => (
              <button
                key={i}
                type="button"
                className="tierbar__tier"
                style={{ background: tierColor(i, count) }}
                aria-pressed={selectedTier === i}
                onClick={() => moveTo(i)}
              >
                {tier.name}
              </button>
            ))}
          </div>
          <div className="tierbar__moves">
            {selectedTier >= 0 && (
              <>
                <button type="button" className="btn" onClick={() => nudge(-1)} disabled={position <= 0}>
                  {t('← 左へ', '← Left')}
                </button>
                <button type="button" className="btn" onClick={() => nudge(1)} disabled={position >= view.tiers[selectedTier].rows.length - 1}>
                  {t('右へ →', 'Right →')}
                </button>
                <button type="button" className="btn" onClick={() => moveTo(null)}>
                  {t('段から外す', 'Unplace')}
                </button>
              </>
            )}
            <button type="button" className="btn" onClick={() => props.onChange(exclude(table, selectedRow.entry.annictId))}>
              {t('表に入れない', 'Leave out')}
            </button>
          </div>
        </div>
      )}

      {sorting && <TierSort table={table} view={view} active={props.active} onChange={props.onChange} onClose={() => setSorting(false)} />}
    </div>
  )
}

function Tile(props: { row: RecordRow; selected: boolean; onClick: (e: MouseEvent) => void }) {
  return (
    <li>
      <TileButton {...props} />
    </li>
  )
}

function TileButton(props: { row: RecordRow; selected: boolean; onClick: (e: MouseEvent) => void }) {
  const title = workTitle(props.row.entry)
  const fallback = <span className="tiertile__text">{title}</span>
  return (
    <button type="button" className="tiertile" data-id={props.row.entry.annictId} aria-pressed={props.selected} title={title} aria-label={title} onClick={props.onClick}>
      {props.row.cover ? <CoverImage cover={props.row.cover} size="thumb" lazy fallback={fallback} /> : fallback}
    </button>
  )
}

// まだ置いていない作品を1枚ずつ、段のボタンで振り分ける（評価の画面と同じく、表紙と題名だけを出す）。
// 表に合わない作品は「表に入れない」。押し間違えたら「ひとつ戻る」で、置いた（か「あとで」「表に入れない」にした）作品に戻って選び直せる
export function TierSort(props: { table: TierTable; view: TierView; active: boolean; onChange: (table: TierTable) => void; onClose: () => void }) {
  // 開いたときの並び。「あとで」は最後に回す
  const [queue, setQueue] = useState(() => props.view.unplaced.map((r) => r.entry.annictId))
  // 置く・「あとで」・「表に入れない」の前の表と並び（新しい順に戻す）
  const [history, setHistory] = useState<{ table: TierTable; queue: number[] }[]>([])
  const unplaced = new Map(props.view.unplaced.map((r) => [r.entry.annictId, r]))
  const pending = queue.filter((id) => unplaced.has(id))
  const row = pending.length > 0 ? unplaced.get(pending[0])! : null
  const count = props.view.tiers.length

  const remember = () => setHistory((h) => [...h, { table: props.table, queue }])
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setQueue(last.queue)
    if (last.table !== props.table) props.onChange(restorePlacement(props.table, last.table))
  }
  const undoButton = (
    <button type="button" className="btn" onClick={undo} disabled={history.length === 0}>
      {t('ひとつ戻る', 'Undo')}
    </button>
  )

  return (
    <Sheet label={t('1枚ずつ振り分ける', 'Place one by one')} active={props.active} onClose={props.onClose}>
      {row ? (
        <div className="tiersort">
          <p className="note">{t(`残り ${pending.length}`, `${pending.length} left`)}</p>
          <div className="tiersort__cover">{row.cover ? <CoverImage cover={row.cover} size="large" /> : <span className="tiertile__text">{workTitle(row.entry)}</span>}</div>
          <p className="tiersort__name">{workTitle(row.entry)}</p>
          <div className="tierbar__tiers tiersort__tiers">
            {props.view.tiers.map((tier, i) => (
              <button
                key={i}
                type="button"
                className="tierbar__tier"
                style={{ background: tierColor(i, count) }}
                onClick={() => {
                  remember()
                  props.onChange(place(props.table, row.entry.annictId, i))
                }}
              >
                {tier.name}
              </button>
            ))}
          </div>
          <div className="tiersort__acts">
            {undoButton}
            <button
              type="button"
              className="btn"
              onClick={() => {
                remember()
                setQueue((q) => [...q.filter((id) => id !== row.entry.annictId), row.entry.annictId])
              }}
              disabled={pending.length < 2}
            >
              {t('あとで', 'Later')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                remember()
                props.onChange(exclude(props.table, row.entry.annictId))
              }}
            >
              {t('表に入れない', 'Leave out')}
            </button>
          </div>
        </div>
      ) : (
        <div className="tiersort">
          <p className="tiersort__name">{t('すべて置きました', 'All placed')}</p>
          <div className="tiersort__acts">
            {undoButton}
            <button type="button" className="btn btn--primary" onClick={props.onClose}>
              {t('表に戻る', 'Back to the list')}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
