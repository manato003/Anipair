import { useEffect, useRef } from 'react'

// Tier表の表紙を引いて動かす。マウスは少し動かしたら、タッチは長押しで掴む（触れてすぐ掴むと、表紙の上から画面を流せなくなる）。
// 動かしているあいだは描き直さず、影・入る位置の線・落とし先の印は DOM を直接動かす（作品の多い表でも指に遅れないように）。
// 落とし先は data-tier（段の行は番号、「まだ置いていない」は pool、「表に入れない作品」は out）、表紙は data-id で見分ける

export interface TierDrop {
  // null は「まだ置いていない」、out は「表に入れない作品」
  tier: number | null | 'out'
  // この作品の前に入れる（null は段の最後）
  before: number | null
}

const HOLD_MS = 300
// マウスはこれだけ動いたら掴む。タッチは長押しの前にこれだけ動いたら、画面を流す操作として諦める
const MOUSE_SLOP = 5
const TOUCH_SLOP = 8
// 画面の上下の端に近づけたら流す（下はタブの帯の分だけ広く）
const EDGE_TOP = 64
const EDGE_BOTTOM = 110
const SCROLL_MAX = 14
// 端の中で掴んだときは、掴んだ位置からさらに端の側へこれだけ動かしてから流す
// （端の近くの表紙を掴んだだけ・そこから反対へ引いただけで画面が流れ出さないように）
const SCROLL_ARM = 16

interface Pending {
  id: number
  tile: HTMLElement
  pointerId: number
  touch: boolean
  x0: number
  y0: number
  timer: ReturnType<typeof setTimeout> | null
}

interface Active {
  id: number
  tile: HTMLElement
  ghost: HTMLElement
  marker: HTMLElement
  dx: number
  dy: number
  x0: number
  y0: number
  x: number
  y: number
  drop: TierDrop | null
  zone: Element | null
  frame: number
}

export function useTierDrag(onDrop: (id: number, drop: TierDrop) => void) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onDropRef = useRef(onDrop)
  useEffect(() => {
    onDropRef.current = onDrop
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let pending: Pending | null = null
    let active: Active | null = null

    const locate = (x: number, y: number, id: number): { drop: TierDrop; zone: Element; mark: DOMRect | null } | null => {
      const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tier]')
      if (!zone || !root.contains(zone)) return null
      if (zone.dataset.tier === 'pool') return { drop: { tier: null, before: null }, zone, mark: null }
      if (zone.dataset.tier === 'out') return { drop: { tier: 'out', before: null }, zone, mark: null }
      const tier = Number(zone.dataset.tier)
      const list = zone.querySelector('.tierrow__items')
      if (!list) return null
      const tiles = [...list.querySelectorAll<HTMLElement>('.tiertile[data-id]')].filter((t) => Number(t.dataset.id) !== id)
      // 折り返した行を上から見て、指より後ろにある最初の表紙の前に入れる
      for (const t of tiles) {
        const r = t.getBoundingClientRect()
        if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return { drop: { tier, before: Number(t.dataset.id) }, zone, mark: new DOMRect(r.left - 3, r.top, 3, r.height) }
      }
      const last = tiles.at(-1)?.getBoundingClientRect()
      const box = list.getBoundingClientRect()
      const h = last?.height ?? root.querySelector('.tiertile')?.getBoundingClientRect().height ?? 40
      return { drop: { tier, before: null }, zone, mark: last ? new DOMRect(last.right, last.top, 3, last.height) : new DOMRect(box.left + 3, box.top + 4, 3, h) }
    }

    const update = () => {
      if (!active) return
      const { x, y } = active
      active.ghost.style.transform = `translate(${x - active.dx}px, ${y - active.dy}px) scale(1.12)`
      const hit = locate(x, y, active.id)
      if (active.zone !== (hit?.zone ?? null)) {
        active.zone?.classList.remove('is-droptarget')
        hit?.zone.classList.add('is-droptarget')
      }
      active.zone = hit?.zone ?? null
      active.drop = hit?.drop ?? null
      const mark = hit?.mark
      active.marker.hidden = !mark
      if (mark) {
        active.marker.style.transform = `translate(${mark.left}px, ${mark.top}px)`
        active.marker.style.height = `${mark.height}px`
      }
    }

    // 端に近いあいだ、毎フレーム流して落とし先を測り直す
    const scrollLoop = () => {
      if (!active) return
      const { y, y0 } = active
      const top = Math.min(EDGE_TOP, y0 - SCROLL_ARM)
      const bottom = Math.max(innerHeight - EDGE_BOTTOM, y0 + SCROLL_ARM)
      const speed = y < top ? -(top - y) / EDGE_TOP : y > bottom ? (y - bottom) / EDGE_BOTTOM : 0
      if (speed !== 0) {
        window.scrollBy(0, Math.round(Math.max(-1, Math.min(1, speed)) * SCROLL_MAX))
        update()
      }
      active.frame = requestAnimationFrame(scrollLoop)
    }

    // 影を持つ位置。指では、指に隠れないよう表紙を指の少し上に浮かべる
    const grip = (p: Pending, r: DOMRect) => (p.touch ? { dx: r.width / 2, dy: r.height + 16 } : { dx: p.x0 - r.left, dy: p.y0 - r.top })

    const begin = () => {
      if (!pending) return
      const { tile, id } = pending
      const r = tile.getBoundingClientRect()
      const ghost = tile.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-id')
      ghost.className = 'tiertile tierghost'
      ghost.setAttribute('aria-hidden', 'true')
      ghost.style.width = `${r.width}px`
      ghost.style.height = `${r.height}px`
      const marker = document.createElement('div')
      marker.className = 'tiermarker'
      marker.hidden = true
      document.body.append(ghost, marker)
      document.body.classList.add('is-tierdragging')
      tile.classList.add('is-dragging')
      if (pending.touch) navigator.vibrate?.(10)
      active = { id, tile, ghost, marker, ...grip(pending, r), x0: pending.x0, y0: pending.y0, x: pending.x0, y: pending.y0, drop: null, zone: null, frame: 0 }
      pending = null
      update()
      active.frame = requestAnimationFrame(scrollLoop)
    }

    const end = (commit: boolean) => {
      if (pending?.timer) clearTimeout(pending.timer)
      pending = null
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onCancel)
      if (!active) return
      const done = active
      active = null
      cancelAnimationFrame(done.frame)
      done.ghost.remove()
      done.marker.remove()
      done.zone?.classList.remove('is-droptarget')
      done.tile.classList.remove('is-dragging')
      document.body.classList.remove('is-tierdragging')
      // 離したあとに続くクリックで、表紙を選んだことにしない
      const stop = (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
      }
      addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => removeEventListener('click', stop, { capture: true }), 0)
      if (commit && done.drop) onDropRef.current(done.id, done.drop)
    }

    function onMove(e: PointerEvent) {
      if (active) {
        active.x = e.clientX
        active.y = e.clientY
        update()
        return
      }
      if (!pending || e.pointerId !== pending.pointerId) return
      const moved = Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0)
      if (pending.touch) {
        if (moved > TOUCH_SLOP) end(false)
      } else if (moved > MOUSE_SLOP) begin()
    }
    const onUp = () => end(true)
    const onCancel = () => end(false)

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || pending || active) return
      const tile = (e.target as Element).closest<HTMLElement>('.tiertile[data-id]')
      if (!tile || !root.contains(tile)) return
      const touch = e.pointerType !== 'mouse'
      pending = { id: Number(tile.dataset.id), tile, pointerId: e.pointerId, touch, x0: e.clientX, y0: e.clientY, timer: touch ? setTimeout(begin, HOLD_MS) : null }
      addEventListener('pointermove', onMove)
      addEventListener('pointerup', onUp)
      addEventListener('pointercancel', onCancel)
    }
    // 掴んだあとは画面を流さず、左右の払い（記録の画面の切り替え）にも渡さない。
    // 長押しの前は止めない（最初の touchmove を止めると、その指では二度と流れない）
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return
      if (e.cancelable) e.preventDefault()
      e.stopPropagation()
    }
    // 長押しで出る画像のメニューを出さない
    const onContextMenu = (e: Event) => {
      if ((e.target as Element).closest('.tiertile')) e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && active) end(false)
    }

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('touchmove', onTouchMove, { passive: false })
    root.addEventListener('contextmenu', onContextMenu)
    addEventListener('keydown', onKey)
    return () => {
      end(false)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('touchmove', onTouchMove)
      root.removeEventListener('contextmenu', onContextMenu)
      removeEventListener('keydown', onKey)
    }
  }, [])

  return rootRef
}
