// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTierDrag, type TierDrop } from './useTierDrag'

function Board(props: { onDrop: (id: number, drop: TierDrop) => void }) {
  const ref = useTierDrag(props.onDrop)
  return (
    <div ref={ref}>
      <div data-tier="pool">
        <div className="tiertile" data-id="1">作品1</div>
      </div>
    </div>
  )
}

afterEach(() => cleanup())

const mouse = (pointerId: number, x: number) => ({ pointerId, pointerType: 'mouse', button: 0, clientX: x, clientY: 10 })

describe('useTierDrag', () => {
  it('掴んだ指のほかの指の動きと離す操作では落とさず、掴んだ指を離したときに落とす', () => {
    const onDrop = vi.fn()
    render(<Board onDrop={onDrop} />)
    const tile = document.querySelector('.tiertile')!
    const pool = document.querySelector('[data-tier="pool"]')!
    document.elementFromPoint = () => pool
    fireEvent.pointerDown(tile, mouse(1, 10))
    fireEvent.pointerMove(window, mouse(1, 30))
    // 別の指が触れて動き、離れた
    fireEvent.pointerMove(window, mouse(2, 200))
    fireEvent.pointerUp(window, mouse(2, 200))
    expect(onDrop).not.toHaveBeenCalled()
    expect(document.querySelector('.tierghost')).not.toBeNull()
    fireEvent.pointerUp(window, mouse(1, 30))
    expect(onDrop).toHaveBeenCalledWith(1, { tier: null, before: null })
    expect(document.querySelector('.tierghost')).toBeNull()
  })
})
