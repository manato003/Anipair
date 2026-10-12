import type { BeforeSendEvent } from '@vercel/analytics/react'

// アクセス解析（Vercel Web Analytics。2026-10-12）。数えるのは、どの画面（タブ）を開いたかだけ。
// Cookie を使わず、IP アドレスも残さない集計（Vercel の説明）。独自のイベント（ボタンを押した回数など）は送らない。
// 画面は URL を変えずに切り替えるので、開いた画面を「/rate」のような道筋にして、こちらから1回ずつ送る

// 送るのは Vercel に置いた本番と preview だけ（手元の開発・E2E では、存在しない解析のスクリプトを読みに行かない）
export function analyticsEnabled(hostname: string): boolean {
  return hostname.endsWith('.vercel.app')
}

// 開いている画面の道筋。ログイン前の最初の画面は「/welcome」
export function screenPath(tab: string, signedIn: boolean): string {
  return signedIn ? `/${tab}` : '/welcome'
}

// 送る直前に、URL を「サイト + 画面の道筋」だけにする。
// 「Annictでログイン」から戻った直後の URL には、Annict の認可コード（?code=…）が一瞬付くので、クエリとハッシュは必ず外す。
// URL として読めなければ送らない（null。外せないまま送らないように。2026-10-13 のコードレビュー #31）
export function withoutQuery(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const u = new URL(event.url)
    return { ...event, url: u.origin + u.pathname }
  } catch {
    return null
  }
}
