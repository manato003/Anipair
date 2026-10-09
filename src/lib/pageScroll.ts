// ページ全体の流し（記録・ブラウズ・設定は、中の箱ではなくページ全体で流れる。iPhone の Safari と Android の Chrome は、
// ページ全体が流れたときだけ下のバーを縮めるため）。
// - 画面ごとに流した位置を覚えて、戻ったときに戻す（画面は隠すだけで残すので、中身の高さも同じ）
// - シートを開いているあいだは、後ろのページを流さない（重ねて開いても、最後のシートを閉じたときに戻す）

const positions = new Map<string, number>()

export function rememberScroll(key: string): void {
  positions.set(key, window.scrollY)
}

export function restoreScroll(key: string): void {
  const y = positions.get(key) ?? 0
  if (window.scrollY !== y) window.scrollTo(0, y)
}

let locks = 0

export function lockPageScroll(): () => void {
  locks += 1
  document.documentElement.dataset.locked = ''
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0) delete document.documentElement.dataset.locked
  }
}

// いちばん上へ流す（長い一覧の「上へ」ボタンと、いまの分類・項目をもう一度押したとき）
export function scrollToTop(): void {
  const smooth = document.documentElement.dataset.motion !== 'reduce'
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
}
