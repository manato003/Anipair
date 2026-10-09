import { useEffect, useRef, useState } from 'react'

// 残り時間を出し始めるまでに、進んだ数と経った時間がこれだけ要る（最初の数件では速さが定まらない）
const ESTIMATE_MIN_STEPS = 3
const ESTIMATE_MIN_MS = 2000

// 残り時間の言い方。細かい数字は約束できないので、1分未満は10秒刻み、それより長ければ分で丸める
export function formatRemaining(seconds: number): string {
  if (seconds < 10) return 'もうすぐ終わります'
  if (seconds < 60) return `残り約${Math.ceil(seconds / 10) * 10}秒`
  return `残り約${Math.round(seconds / 60)}分`
}

// 進み具合（done / total）から残りの秒数を見積もる。数え始めてからの平均の速さ × 残りの数。
// 総数が変わったら（別の作業に移ったら）数え直す。見積もれないあいだは null
export function useRemaining(progress: { done: number; total: number } | undefined): number | null {
  const done = progress?.done
  const total = progress?.total
  const first = useRef<{ at: number; done: number; total: number } | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const update = () => {
      if (done === undefined || total === undefined) {
        first.current = null
        return null
      }
      const now = Date.now()
      const f = first.current
      if (!f || f.total !== total || done < f.done) {
        first.current = { at: now, done, total }
        return null
      }
      const steps = done - f.done
      const ms = now - f.at
      if (steps < ESTIMATE_MIN_STEPS || ms < ESTIMATE_MIN_MS) return null
      return ((ms / steps) * Math.max(0, total - done)) / 1000
    }
    setLeft(update())
  }, [done, total])
  return left
}
