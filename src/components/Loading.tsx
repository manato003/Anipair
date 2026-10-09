import { useEffect, useId, useState } from 'react'
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

// 動くロゴ（public/logo-mark.svg と同じ形）。2つの円が離れては寄り添い、重なったところに星が光る。
// 大きさは CSS の幅で決める（.loading-mark）。グラデーションの ID は画面に複数あってもぶつからないよう useId で作る
export function LoadingMark(props: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={['loading-mark', props.className ?? ''].filter(Boolean).join(' ')} viewBox="-20 0 451 276" aria-hidden>
      <defs>
        <radialGradient id={`${id}l`} cx="0.66" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.5" stopColor="#E6F0FF" />
          <stop offset="1" stopColor="#9FC0FF" />
        </radialGradient>
        <radialGradient id={`${id}r`} cx="0.34" cy="0.45" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.5" stopColor="#FFE8F2" />
          <stop offset="1" stopColor="#FFA3CC" />
        </radialGradient>
        <linearGradient id={`${id}m`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#6483F6" />
          <stop offset="1" stopColor="#B07CF0" />
        </linearGradient>
      </defs>
      <circle className="loading-mark__left" cx="138" cy="138" r="138" fill={`url(#${id}l)`} />
      <circle className="loading-mark__right" cx="273" cy="138" r="138" fill={`url(#${id}r)`} />
      <path className="loading-mark__lens" d="M205.5 17.63 A138 138 0 0 1 205.5 258.37 A138 138 0 0 1 205.5 17.63 Z" fill={`url(#${id}m)`} />
      <path className="loading-mark__star" d="M205.5 86 Q212.5 131 257.5 138 Q212.5 145 205.5 190 Q198.5 145 153.5 138 Q198.5 131 205.5 86 Z" fill="#fff" />
    </svg>
  )
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
