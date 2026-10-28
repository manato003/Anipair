// 並べ替え（記録とブラウズ）。文字だけの切り替えで、選んでいる並べ方を濃くする。
// 押している並べ方をもう一度押すと、昇順と降順が入れ替わる（矢印で向きを示す）。
// 矢印の幅はどの並べ方にも空けておく（選び直したときに、文字の位置が揺れないように）
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../lib/i18n'
import { InfoIcon } from './Icons'
import { layerZoom, useSheetLayer } from './sheetLayer'

export type SortDir = 'desc' | 'asc'

// note: その並べ方が何の順かの1文。どれかに付いていれば、行の右端に「i」を出す
export interface SortOption<K extends string> {
  key: K
  label: string
  note?: string
}

export function SortRow<K extends string>(props: { options: readonly SortOption<K>[]; value: K; dir: SortDir; onChoose: (key: K) => void }) {
  const notes = props.options.filter((o) => o.note)
  return (
    <div className="rsort" role="group" aria-label={t('並べ替え', 'Sort')}>
      {props.options.map((o) => {
        const on = props.value === o.key
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => props.onChoose(o.key)} title={on ? t('もう一度押すと、並びの向きが逆になります', 'Press again to reverse the order') : undefined}>
            {o.label}
            <span className="sortdir" aria-label={on ? (props.dir === 'desc' ? t('降順', 'Descending') : t('昇順', 'Ascending')) : undefined}>
              {on ? (props.dir === 'desc' ? '↓' : '↑') : ''}
            </span>
          </button>
        )
      })}
      {notes.length > 0 && <SortInfo options={notes} />}
    </div>
  )
}

// パネルを置く余白（画面の端・ボタンとのあいだ）
const EDGE = 16
const GAP = 6

// 並べ方の説明。使い方（?）まで行かずに、知りたい人だけが「i」を押して読む。
// ボタンは薄く小さく、並べ替えの文字より目立たせない。パネルはクール選びと同じく、画面ごとの層に描き、
// 「i」をもう一度押す・外側を押す・Esc・ページを流す・画面の大きさが変わると閉じる
function SortInfo<K extends string>({ options }: { options: readonly SortOption<K>[] }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const layer = useSheetLayer()
  const open = pos !== null

  // ボタンの下に置く。右端のボタンなので、パネルの右端をボタンの右端にそろえ、画面からはみ出さないようにする
  const toggle = () => {
    if (open) {
      setPos(null)
      return
    }
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const z = layerZoom(layer)
    const vw = window.innerWidth / z
    const width = Math.min(320, vw - EDGE * 2)
    const left = Math.min(Math.max(EDGE, r.right / z - width), vw - width - EDGE)
    setPos({ top: r.bottom / z + GAP, left, width })
  }
  const close = (refocus: boolean) => {
    setPos(null)
    if (refocus) buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && panelRef.current?.contains(e.target))) close(false)
    }
    const onResize = () => close(false)
    // パネルの中に押すものは無く、フォーカスは「i」に残るので、Esc は開いているあいだ画面全体で拾う
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="rsort__info"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('並べ方の説明', 'About the sort orders')}
        onClick={toggle}
      >
        <InfoIcon />
      </button>
      {pos &&
        createPortal(
          <div ref={panelRef} className="sortinfo" role="dialog" aria-label={t('並べ方の説明', 'About the sort orders')} style={pos} data-no-swipe>
            <dl className="sortinfo__list">
              {options.map((o) => (
                <div key={o.key}>
                  <dt>{o.label}</dt>
                  <dd>{o.note}</dd>
                </div>
              ))}
            </dl>
            <p className="sortinfo__foot">{t('押している並べ方をもう一度押すと、逆の順になります。情報の無い作品は最後に並びます。', 'Tap the current sort again to reverse it. Anime without the data come last.')}</p>
          </div>,
          layer,
        )}
    </>
  )
}
