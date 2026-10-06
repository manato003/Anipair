import { useEffect, useId, useState } from 'react'

// 読み込み中の表示。止まっている（固まった）のではなく動いていると分かるように、動くロゴと、少し経ったら経過秒数を出す。
// 動きを減らす設定ではロゴは動かないが、秒数は進む。長くかかったら一言添える（このまま待てば続くこと）
const SHOW_SECONDS_AFTER = 3
const SLOW_AFTER = 15

// 表示してからの秒数（1秒ごとに進む）。since（Date.now() の値）を渡すと、その時刻から数える（表示を入れ替えても秒数を続ける）
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

// 経過秒数だけ（すでに動きのある待ち画面に添える）。数秒経つまでは出さない
export function Elapsed() {
  const seconds = useElapsed()
  return seconds >= SHOW_SECONDS_AFTER ? (
    <span className="loading__time" aria-hidden>
      （{seconds}秒）
    </span>
  ) : null
}

// block: 一覧の場所いっぱいに、真ん中に大きく出す。mark={false}: ロゴを別の場所（カードの表紙の位置）に出しているとき。
// className は置き場所の調整用。since: 秒数を数え始める時刻（Date.now() の値）
export function Loading(props: { label: string; block?: boolean; delay?: number; mark?: boolean; className?: string; since?: number }) {
  const shown = useShown(props.delay ?? 0)
  const seconds = useElapsed(props.since)
  if (!shown) return null
  const cls = ['loading', props.block ? 'loading--block' : '', props.className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={cls} role="status" aria-busy>
      {props.mark !== false && <LoadingMark />}
      <span className="loading__label">
        {props.label}
        {/* 秒数は読み上げない（毎秒読まれてしまう） */}
        {seconds >= SHOW_SECONDS_AFTER && (
          <span className="loading__time" aria-hidden>
            （{seconds}秒）
          </span>
        )}
      </span>
      {seconds >= SLOW_AFTER && <span className="loading__slow">通信に時間がかかっています。このまま待つと続きます。</span>}
    </div>
  )
}
