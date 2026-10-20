import { PRODUCTION_HOST } from './analytics'
import { resetFirstRunHints } from './storage'

// preview と手元だけの、初めての人の画面を見るための入り口（本番の anipair.com では効かない）。
// ログインしている端末では、最初の画面も初めての案内も出ないので、見た目や文言を確かめられなかった（2026-10-20 利用者）
// - ?welcome: ログインしたままでも、ログイン前の最初の画面だけを出す（features/settings/WelcomePreview.tsx）
// - ?firstrun: 初めての案内（使い方のシート・シートの閉じ方）を、もう一度出す。開いたあとは URL から外す（読み直すたびに出し直さない）
function isPreviewHost(hostname: string): boolean {
  return hostname !== PRODUCTION_HOST
}

export function isWelcomePreview(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return isPreviewHost(location.hostname) && new URLSearchParams(location.search).has('welcome')
}

export function wantsFirstRun(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return isPreviewHost(location.hostname) && new URLSearchParams(location.search).has('firstrun')
}

export function applyFirstRunParam(): void {
  if (!wantsFirstRun(window.location)) return
  resetFirstRunHints()
  const url = new URL(window.location.href)
  url.searchParams.delete('firstrun')
  history.replaceState(history.state, '', url)
}
