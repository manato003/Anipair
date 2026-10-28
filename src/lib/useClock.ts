import { useEffect, useState } from 'react'

// いまの時刻を、1分ごとに更新する（active のあいだだけ）。放送の時刻を過ぎたら「次の放送」を次の回へ進めるため
export function useClock(active: boolean, stepMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    // 表示に戻ったときは、すぐ今の時刻にする（隠れていたあいだに時刻が進んでいる）
    const first = window.setTimeout(() => setNow(new Date()), 0)
    const t = window.setInterval(() => setNow(new Date()), stepMs)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(t)
    }
  }, [active, stepMs])
  return now
}
