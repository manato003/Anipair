import { useEffect, useState } from 'react'
import { Ani } from './Mascot'
import { formatRemaining, useRemaining } from '../lib/useRemaining'

// 読み込み中の表示。止まっている（固まった）のではなく動いていると分かるように、動くロゴを出し、長くかかったら一言添える（このまま待てば続くこと）。
// 経過秒数は出さない（あと何秒かかるのかと読まれ、終わりの見えない数字になっていた）。
// 作業の総数と進み具合が分かるところだけ、進んだ速さから残り時間を見積もって出す（remaining）
const SLOW_AFTER = 15

// 表示してからの秒数（1秒ごとに進む。画面には出さず、長くかかったときの一言に使う）。since（Date.now() の値）を渡すと、その時刻から数える
function useElapsed(since?: number): number {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const start = since ?? Date.now()
    const tick = () => setSeconds(Math.floor((Date.now() - start) / 1000))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [since])
  return seconds
}

// delay（ミリ秒）: すぐ終わる読み込みでちらつかないよう、それまでは何も出さない
function useShown(delay: number): boolean {
  const [shown, setShown] = useState(delay <= 0)
  useEffect(() => {
    if (delay <= 0) return
    const t = setTimeout(() => setShown(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return shown
}

// 読み込み中の印: アニのアンテナが揺れて、受信している（components/Mascot.tsx）。大きさは CSS の幅で決める（.loading-mark）
export function LoadingMark(props: { className?: string }) {
  return <Ani wiggle expr="think" className={['loading-mark', props.className ?? ''].filter(Boolean).join(' ')} />
}

// 回る輪（ボタンの中など、小さく色の上に置くところ）
export function Spinner() {
  return <span className="loading__spinner" aria-hidden />
}

// 残り時間だけ（すでに動きのある待ち画面に添える）。見積もれるまでは出さない
export function Remaining(props: { done: number; total: number }) {
  const seconds = useRemaining(props)
  return seconds === null ? null : (
    <span className="loading__time" aria-hidden>
      ・{formatRemaining(seconds)}
    </span>
  )
}

// block: 一覧の場所いっぱいに、真ん中に大きく出す。mark={false}: ロゴを別の場所（カードの表紙の位置）に出しているとき。
// className は置き場所の調整用。since: 待ち始めた時刻（Date.now() の値。長くかかったときの一言をそこから数える）。
// remaining: 作業の進み具合（分かるときだけ）。残り時間の見積もりを添える
export function Loading(props: {
  label: string
  block?: boolean
  delay?: number
  mark?: boolean
  className?: string
  since?: number
  remaining?: { done: number; total: number }
}) {
  const shown = useShown(props.delay ?? 0)
  const seconds = useElapsed(props.since)
  const left = useRemaining(props.remaining)
  if (!shown) return null
  const cls = ['loading', props.block ? 'loading--block' : '', props.className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={cls} role="status" aria-busy>
      {props.mark !== false && <LoadingMark />}
      <span className="loading__label">
        {props.label}
        {/* 残り時間は読み上げない（進むたびに読まれてしまう） */}
        {left !== null && (
          <span className="loading__time" aria-hidden>
            ・{formatRemaining(left)}
          </span>
        )}
      </span>
      {/* 残り時間を出しているときは、続いていることが分かるので添えない */}
      {seconds >= SLOW_AFTER && left === null && <span className="loading__slow">通信に時間がかかっています。このまま待つと続きます。</span>}
    </div>
  )
}
