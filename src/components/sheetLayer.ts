import { createContext, useContext } from 'react'

// シートを描く層。各画面（App の Screen）が自分の層を用意し、シートはそこへ描く。
// 画面の見出しなどの重なり順（z-index）の中で描くと、分類の帯が上に重なったり、後ろの要素が透けたりする。
// 層は画面ごとなので、隠れたタブに開いたままのシートは、画面と一緒に隠れる。層が無いとき（テスト・ログイン前）は body に描く
export const SheetLayer = createContext<HTMLElement | null>(null)

export function useSheetLayer(): HTMLElement {
  return useContext(SheetLayer) ?? document.body
}

// 層の拡大率。大きな画面ではアプリ全体を zoom で拡大する（styles/app.css の --zoom）。
// getBoundingClientRect と innerWidth は拡大した後の寸法で、層に置く要素の top・left はさらに拡大されるので、この値で割ってから渡す
// （割らないと 4K で右下へ倍ずれて、画面の外に出た）
export function layerZoom(layer: HTMLElement): number {
  const z = (layer as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom
  if (z) return z
  return appZoom()
}

// アプリ全体の拡大率（:root の --zoom）。アプリの外（body）に描く要素が、アプリと同じ大きさに見えるように使う
export function appZoom(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom')) || 1
}
