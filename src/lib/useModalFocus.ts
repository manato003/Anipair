import { useEffect, type RefObject } from 'react'

// 画面の上に重ねて開くもの（シート・覚醒の演出・使い方の案内。どれも aria-modal を名乗る）のフォーカス。
// - Tab と Shift+Tab を、いちばん上に開いているものの中で回す（後ろの画面に移らない）
// - 閉じたら、開く前にフォーカスがあった要素に戻す（キーボードで開いて閉じたあと、どこにいたか分からなくならない）
// 最初にどこへフォーカスを置くかは、それぞれが決める（閉じるボタン・次へなど）。
// シートの上にシートを重ねて開くこと（関連作品の詳細）があるので、開いている順に積み、いちばん上だけが Tab を受け持つ
// （2026-10-07 の点検: Tab でシートの後ろの画面に移り、閉じたあとも元の場所に戻らなかった）

const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]'

const stack: HTMLElement[] = []

function focusables(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden], [inert]'),
  )
}

export function useModalFocus(ref: RefObject<HTMLElement | null>, active = true): void {
  // 開く前にフォーカスがあった要素を覚え、閉じたら戻す
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      if (opener && opener.isConnected && !opener.closest('[hidden]')) opener.focus()
    }
  }, [])

  useEffect(() => {
    const container = ref.current
    if (!active || !container) return
    stack.push(container)
    // 最後に押した Tab の向き（外へ出たフォーカスを、どちらの端へ戻すか）
    let backward = false
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || stack[stack.length - 1] !== container) return
      backward = e.shiftKey
      const items = focusables(container)
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const inside = current instanceof Node && container.contains(current)
      if (e.shiftKey && (current === first || !inside)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !inside)) {
        e.preventDefault()
        first.focus()
      }
    }
    // ブラウザの Tab の順には、上の一覧に入らないもの（スクロールできる枠など。Chrome は止まれる場所にする）もあるので、
    // 一覧の端で折り返すだけでは外へ出ることがある。外へ出た瞬間に、押した向きの端へ戻す
    const onFocusIn = (e: FocusEvent) => {
      // 閉じて画面から外れたあと（開いた場所へフォーカスを戻すとき）は、何もしない
      if (!container.isConnected || stack[stack.length - 1] !== container || !(e.target instanceof Node) || container.contains(e.target)) return
      const items = focusables(container)
      ;(backward ? items[items.length - 1] : items[0])?.focus()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocusIn)
      const at = stack.lastIndexOf(container)
      if (at >= 0) stack.splice(at, 1)
    }
  }, [ref, active])
}
