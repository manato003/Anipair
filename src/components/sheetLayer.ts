import { createContext, useContext } from 'react'

// シートを描く層。各画面（App の Screen）が自分の層を用意し、シートはそこへ描く。
// 画面の見出しなどの重なり順（z-index）の中で描くと、分類の帯が上に重なったり、後ろの要素が透けたりする。
// 層は画面ごとなので、隠れたタブに開いたままのシートは、画面と一緒に隠れる。層が無いとき（テスト・ログイン前）は body に描く
export const SheetLayer = createContext<HTMLElement | null>(null)

export function useSheetLayer(): HTMLElement {
  return useContext(SheetLayer) ?? document.body
}
