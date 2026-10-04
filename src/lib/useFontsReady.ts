import { useEffect, useState, type RefObject } from 'react'

// 書体（Web フォント）がそろってから中身を出すための合図。
// 日本語の Web フォントは字ごとに小分けのファイルになっていて、初めて出る字があると、そのファイルを読んでから組み直す。
// 中身を並べたまま待つと、ファイルが1つ届くたびに全体を組み直して重い（初めて開いた詳細で40個ほど届く）。
// そこで中身は並べずに（display: none のまま）置いておき、そこに含まれる字を書体ごとに集めて、必要なファイルだけを先に読む。
// 全部届いたら true を返す。並べるのはそのあとの1回だけで済む。
// ready（中身がそろった）になってから数え、timeoutMs を過ぎたら、読み込みの途中でも true にする（遅い回線でも出なくならないように）
export function useFontsReady(ready: boolean, root: RefObject<HTMLElement | null>, timeoutMs = 1200): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!ready || shown) return
    let cancelled = false
    const done = () => {
      if (!cancelled) setShown(true)
    }
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    const el = root.current
    const timer = window.setTimeout(done, fonts && el ? timeoutMs : 0)
    if (fonts && el) {
      Promise.all([...textByFont(el)].map(([font, text]) => fonts.load(font, text))).then(done, done)
    }
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, shown, root, timeoutMs])
  return shown
}

// root の中の字を、使う書体（太さ・斜体・書体名）ごとに集める。並べていない（display: none の）要素でも、書体は分かる
export function textByFont(root: HTMLElement): Map<string, string> {
  const groups = new Map<string, Set<string>>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    const parent = node.parentElement
    if (!text || !parent) continue
    const style = getComputedStyle(parent)
    const font = `${style.fontStyle} ${style.fontWeight} 16px ${style.fontFamily}`
    let chars = groups.get(font)
    if (!chars) groups.set(font, (chars = new Set()))
    for (const ch of text) chars.add(ch)
  }
  return new Map([...groups].map(([font, chars]) => [font, [...chars].join('')]))
}
