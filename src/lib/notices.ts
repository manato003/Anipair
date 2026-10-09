import { useEffect, useRef, useSyncExternalStore } from 'react'

// コントロールセンターに集める知らせ（保存の失敗・送れなかった記録・読み直せなかった・ログインの切れなど）。
// 出す側は、その状態のあいだ useNotice に渡しておく。状態が終われば（null を渡すか、外れれば）消える。
// 急ぐもの（urgent）は、これまでどおり画面の上にも出したまま、ここにも並べる
export interface Notice {
  id: string
  title: string
  body?: string
  action?: { label: string; run: () => void }
  urgent?: boolean
}

let notices: readonly Notice[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function publishNotice(n: Notice): void {
  notices = [...notices.filter((x) => x.id !== n.id), n]
  emit()
}

export function withdrawNotice(id: string): void {
  if (!notices.some((x) => x.id === id)) return
  notices = notices.filter((x) => x.id !== id)
  emit()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(subscribe, () => notices, () => notices)
}

// 知らせを出しておく。押したときの動きは、いちばん新しい描画のものを使う（古い状態の関数を呼ばない）
export function useNotice(notice: Notice | null): void {
  const latest = useRef(notice)
  useEffect(() => {
    latest.current = notice
  })
  const id = notice?.id
  const title = notice?.title
  const body = notice?.body
  const label = notice?.action?.label
  const urgent = notice?.urgent
  useEffect(() => {
    if (!id || !title) return
    publishNotice({ id, title, body, urgent, action: label ? { label, run: () => latest.current?.action?.run() } : undefined })
    return () => withdrawNotice(id)
  }, [id, title, body, label, urgent])
}

// テスト用
export function resetNotices(): void {
  notices = []
  emit()
}
