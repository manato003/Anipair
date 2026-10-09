import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Cover } from '../lib/storage'
import { CoverImage } from './CoverImage'
import { InfoIcon } from './Icons'
import { Phrase } from './Phrase'
import { reducedMotion } from '../lib/theme'

// 評価とマッチングの「縦の流れ」。
// 上に直前の答え（答えの印つき）、真ん中にいまの作品の表紙を大きく、下に次の作品。その下（広い画面では右）に答えの欄。
// 答えて作品が替わると、同じ作品の表紙が前の位置からいまの位置へ縮み・伸びながら移る（いまの表紙 → 直前の答え、次の作品 → いまの表紙）

export interface FlowItem {
  key: string
  title: string
  cover: Cover | null
}

export interface FlowPrev extends FlowItem {
  // 答えの印（アイコンと名前）。強い印（見たい）は塗る
  mark: { label: string; icon: ReactNode; strong?: boolean }
}

// 動きの長さと曲線（D1 の決まり）
const FLOW_MS = 380
const FLOW_EASE = 'cubic-bezier(0.3, 0.7, 0.2, 1)'


// 描くたびに、表紙の箱（data-flip）の位置と大きさを覚えておき、次に描いたとき同じ作品の箱を前の位置から動かす
function useFlip(root: React.RefObject<HTMLElement | null>, signature: string) {
  const last = useRef(new Map<string, DOMRect>())
  const lastSig = useRef(signature)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const boxes = [...el.querySelectorAll<HTMLElement>('[data-flip]')]
    const changed = lastSig.current !== signature
    lastSig.current = signature
    const animating = (box: HTMLElement) => typeof box.getAnimations === 'function' && box.getAnimations().length > 0
    // 見えていない箱（縦の短い画面で隠した「次の作品」の行など）は、大きさ0・左上の位置になる。起点にすると、表紙が左上の点から広がる
    const visible = (r: DOMRect) => r.width > 0 && r.height > 0
    if (!changed) {
      // 動きの途中の位置を控えない（途中の位置から次の動きが始まってしまう）。止まっている箱だけ測り直す
      for (const box of boxes) {
        if (animating(box)) continue
        const r = box.getBoundingClientRect()
        if (visible(r)) last.current.set(box.dataset.flip ?? '', r)
        else last.current.delete(box.dataset.flip ?? '')
      }
      return
    }
    // 前の動きが残っていれば止めてから、行き先の位置を測る。控えるのはこの行き先の位置
    // （動き始めの位置を控えると、次に答えたとき下の段や途中の位置から動き出していた）
    for (const box of boxes) if (typeof box.getAnimations === 'function') box.getAnimations().forEach((a) => a.cancel())
    const targets = new Map(boxes.map((b) => [b.dataset.flip ?? '', b.getBoundingClientRect()] as const).filter(([, r]) => visible(r)))
    if (!reducedMotion() && typeof Element.prototype.animate === 'function') {
      for (const box of boxes) {
        const from = last.current.get(box.dataset.flip ?? '')
        const to = targets.get(box.dataset.flip ?? '')
        if (!to) continue
        if (!from) {
          // 起点が無い（初めて出る・次の作品の行を隠している）: 下から少し上がりながら現れる（次の作品は下から来る）
          box.animate([{ opacity: 0, transform: 'translateY(12%)' }, { opacity: 1, transform: 'none' }], { duration: FLOW_MS, easing: FLOW_EASE })
          continue
        }
        box.animate(
          [
            { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
            { transformOrigin: 'top left', transform: 'none' },
          ],
          { duration: FLOW_MS, easing: FLOW_EASE },
        )
      }
      for (const text of el.querySelectorAll<HTMLElement>('[data-flow-text]')) {
        text.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 60, easing: 'ease-out', fill: 'backwards' })
      }
    }
    last.current = targets
  })
}

export function FlowStage(props: {
  // いまの作品。無いあいだ（読み込み中・空・踏破）は placeholder を表紙の場所に出す
  current: (FlowItem & { onOpen: () => void; info: ReactNode }) | null
  placeholder?: ReactNode
  prev: FlowPrev | null
  next: FlowItem | null
  // 答えの欄
  children: ReactNode
  // 直前の答えが無いときの一言
  emptyPrev?: string
  // 次の次から先の作品の表紙（先に読んでおき、続けて速く答えても前の表紙が残らないように）
  ahead?: readonly (Cover | null)[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { current, prev, next } = props
  useFlip(ref, `${prev?.key ?? ''}|${current?.key ?? ''}|${next?.key ?? ''}`)
  return (
    <div className="flow" ref={ref}>
      {prev ? (
        <div className="flow__row flow__row--prev">
          <span key={prev.key} className="flow__thumb" data-flip={prev.key}>
            {prev.cover && <CoverImage cover={prev.cover} size="thumb" />}
          </span>
          <b className="flow__rowtitle" data-flow-text>
            {prev.title}
          </b>
          <span className={prev.mark.strong ? 'flow__mark flow__mark--strong' : 'flow__mark'} data-flow-text>
            {prev.mark.icon}
            {prev.mark.label}
          </span>
        </div>
      ) : (
        <p className="flow__row flow__row--empty">{props.emptyPrev ?? '答えた作品は、ここに印を付けて残ります'}</p>
      )}

      {current ? (
        <>
          {/* 作品ごとに作り直す（同じ img の src を差し替えると、新しい画像を読み終えるまで前の作品の表紙が出たままになる） */}
          <button key={current.key} type="button" className="flow__art" data-flip={current.key} onClick={current.onOpen} aria-label="詳しく見る">
            {current.cover ? <CoverImage cover={current.cover} size="large" fallback={<span className="flow__noimage">{current.title}</span>} /> : <span className="flow__noimage">{current.title}</span>}
            {/* 押すと詳しく見られる印。PC だけに出す */}
            <span className="flow__info" aria-hidden>
              <InfoIcon />
            </span>
          </button>
          <div className="flow__text" data-flow-text>
            <h2 className="flow__title">
              <Phrase text={current.title} />
            </h2>
            {current.info}
          </div>
        </>
      ) : (
        <div className="flow__placeholder">{props.placeholder}</div>
      )}

      {next ? (
        <div className="flow__row flow__row--next" aria-hidden>
          <span key={next.key} className="flow__thumb" data-flip={next.key}>
            {next.cover && <CoverImage cover={next.cover} size="thumb" />}
          </span>
          <b className="flow__rowtitle">{next.title}</b>
        </div>
      ) : (
        <span className="flow__row flow__row--none" aria-hidden />
      )}

      <div className="flow__answers">{props.children}</div>
      {/* 次とその先の表紙を先に読み込んでおき、切り替えを待たせない */}
      {[next?.cover ?? null, ...(props.ahead ?? [])].map((c) => c && <link key={c.url} rel="preload" as="image" href={c.url} />)}
    </div>
  )
}
