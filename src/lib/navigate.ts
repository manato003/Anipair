// アプリの中の移動（コントロールセンターの「表示の設定」など、画面の外から分類を替える）。App が受け手を登録する
export type Destination = { tab: 'rate' | 'match' | 'records' | 'browse' | 'settings'; anchor?: string }

let handler: ((d: Destination) => void) | null = null

export function setNavigator(fn: ((d: Destination) => void) | null): void {
  handler = fn
}

export function navigate(d: Destination): void {
  handler?.(d)
}
