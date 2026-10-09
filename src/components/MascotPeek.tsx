import { useEffect, useRef, useState } from 'react'
import { AniFigure, PairFigure, type MascotExpr } from './Mascot'
import { reducedMotion } from '../lib/theme'

// アニとペアが、ときどき画面の下に出てくる。
// - のぞく: 下の帯の陰から顔を出し、画面のどこかに触れるまで居続けて、ときどききょろきょろする。触れると引っ込む（本人に触れると喜んでから）
// - 散歩: 帯の上を、ゆっくり端から端まで歩いて通り過ぎる。2人・アニだけ・ペアだけの3通り。触れた子はぴょんと跳ねる
// - 出るのは記録・ブラウズ・設定だけ（enabled）。評価とマッチングは、答えるボタンが下にあるので出さない
// - 操作が止まって 6 秒たってから。間隔は 30 秒〜1 分ほど。シートを開いているあいだ・画面が隠れているあいだは出ない
// - 深夜（0〜5 時）のアニは眠そう
// - 動きを減らす設定と、演出「なし」では出さない。「控えめ」では間隔を倍にする
// 飾りなので、読み上げとキーボードの対象にしない

const IDLE_MS = 6000
const FIRST_MS = [10_000, 20_000] as const
const NEXT_MS = [30_000, 60_000] as const
// 散歩の速さ（1 秒に進む px）と、引っ込む動きの長さ
const WALK_SPEED = 40
const LEAVE_MS = 600
const CHEER_MS = 900

type Who = 'ani' | 'pair'
type Visit =
  | { key: number; kind: 'peek'; who: Who; x: number; bottom: number; expr: MascotExpr }
  | { key: number; kind: 'walk'; walkers: Who[]; bottom: number; expr: Record<Who, MascotExpr>; dir: 1 | -1; ms: number }

const between = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a)

function sheetOpen(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0)
}

// 下の帯の上端（帯が上にある広い画面では、画面の下端）
function floorFromBottom(): number {
  const tabs = document.querySelector('nav.tabs')
  if (!tabs) return 0
  const r = tabs.getBoundingClientRect()
  return r.top > window.innerHeight / 2 ? window.innerHeight - r.top : 0
}

function Figure(props: { who: Who; expr: MascotExpr; cheer: boolean }) {
  const expr = props.cheer ? 'happy' : props.expr
  const arms = props.cheer ? 'up' : 'down'
  return props.who === 'ani' ? <AniFigure expr={expr} arms={arms} /> : <PairFigure expr={expr} arms={arms} />
}

export function MascotPeek(props: { enabled: boolean }) {
  const [visit, setVisit] = useState<Visit | null>(null)
  // 引っ込むところ（のぞくの終わり）
  const [leaving, setLeaving] = useState(false)
  // 触れられて喜んでいる子
  const [cheer, setCheer] = useState<Who | null>(null)
  // 最後に操作した時刻（0 は「まだ無い」。最初の訪問は、開いてから 10 秒以上たってからなので、止まっていると見てよい）
  const lastInput = useRef(0)
  const seq = useRef(0)
  // いま出ている訪問（操作を受けたときに、のぞいている子を引っ込めるため）
  const current = useRef<Visit | null>(null)
  const dismiss = useRef<() => void>(() => undefined)

  // 操作したら時刻を控え、のぞいている子がいれば引っ込める（本人に触れたときは、本人の側で喜ばせる）
  useEffect(() => {
    const touch = (e: Event) => {
      lastInput.current = Date.now()
      const v = current.current
      if (v?.kind === 'peek' && !(e.target instanceof Element && e.target.closest('.peek__body'))) dismiss.current()
    }
    const opts = { passive: true, capture: true } as const
    const types = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const
    for (const t of types) window.addEventListener(t, touch, opts)
    return () => {
      for (const t of types) window.removeEventListener(t, touch, opts)
    }
  }, [])

  useEffect(() => {
    if (!props.enabled) return
    let timer = 0
    let first = true
    const schedule = () => {
      const subtle = document.documentElement.dataset.effects === 'subtle'
      const wait = between(first ? FIRST_MS : NEXT_MS) * (subtle ? 2 : 1)
      first = false
      window.clearTimeout(timer)
      timer = window.setTimeout(tryVisit, wait)
    }
    const end = () => {
      current.current = null
      setVisit(null)
      setLeaving(false)
      setCheer(null)
      schedule()
    }
    // のぞいている子を引っ込める（引っ込む動きのあと、次の訪問を決める）
    dismiss.current = () => {
      if (current.current?.kind !== 'peek') return
      current.current = null
      setLeaving(true)
      window.clearTimeout(timer)
      timer = window.setTimeout(end, LEAVE_MS)
    }
    const tryVisit = () => {
      const blocked = document.hidden || reducedMotion() || document.documentElement.dataset.effects === 'off' || sheetOpen()
      if (blocked) return schedule()
      // 操作の途中なら、止まるまで少し待つ
      if (Date.now() - lastInput.current < IDLE_MS) {
        timer = window.setTimeout(tryVisit, IDLE_MS)
        return
      }
      const late = new Date().getHours() < 5
      const exprOf = (who: Who, normal: MascotExpr): MascotExpr => (who === 'ani' && late ? 'sleepy' : normal)
      seq.current += 1
      setLeaving(false)
      setCheer(null)
      let v: Visit
      if (Math.random() < 0.6) {
        const who: Who = Math.random() < 0.55 ? 'ani' : 'pair'
        v = { key: seq.current, kind: 'peek', who, x: 12 + Math.random() * 70, bottom: floorFromBottom(), expr: exprOf(who, 'normal') }
        // のぞいた子は、触れられるまで居続ける（引っ込めるのは dismiss）
      } else {
        const r = Math.random()
        const walkers: Who[] = r < 0.4 ? ['ani', 'pair'] : r < 0.7 ? ['ani'] : ['pair']
        const ms = Math.round(((window.innerWidth + 160 + (walkers.length - 1) * 70) / WALK_SPEED) * 1000)
        v = { key: seq.current, kind: 'walk', walkers, bottom: floorFromBottom(), expr: { ani: exprOf('ani', 'happy'), pair: 'happy' }, dir: Math.random() < 0.5 ? 1 : -1, ms }
        timer = window.setTimeout(end, ms)
      }
      current.current = v
      setVisit(v)
    }
    schedule()
    return () => {
      window.clearTimeout(timer)
      current.current = null
      dismiss.current = () => undefined
      setVisit(null)
    }
  }, [props.enabled])

  if (!visit) return null

  if (visit.kind === 'peek') {
    const cls = ['peek', 'peek--peek', leaving ? 'peek--leave' : '', cheer ? 'peek--cheer' : ''].filter(Boolean).join(' ')
    return (
      <div className={cls} style={{ bottom: visit.bottom, left: `${visit.x}%` }} aria-hidden>
        <div className="peek__walker">
          <svg
            className="mascot peek__body"
            viewBox="0 0 120 120"
            onPointerDown={() => {
              if (cheer || leaving) return
              setCheer(visit.who)
              window.setTimeout(() => dismiss.current(), CHEER_MS)
            }}
          >
            <Figure who={visit.who} expr={visit.expr} cheer={cheer === visit.who} />
          </svg>
        </div>
      </div>
    )
  }

  const cls = ['peek', 'peek--walk', visit.dir < 0 ? 'peek--rtl' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} style={{ bottom: visit.bottom, ['--walk-ms' as string]: `${visit.ms}ms` }} aria-hidden>
      <div className="peek__walker">
        {visit.walkers.map((who, i) => (
          <svg
            key={who}
            className={`mascot peek__body peek__body--${who}${cheer === who ? ' peek__body--hop' : ''}`}
            viewBox="0 0 120 120"
            style={{ animationDelay: `${i * -0.21}s` }}
            onPointerDown={() => {
              setCheer(who)
              window.setTimeout(() => setCheer((c) => (c === who ? null : c)), CHEER_MS)
            }}
          >
            <Figure who={who} expr={visit.expr[who]} cheer={cheer === who} />
          </svg>
        ))}
      </div>
    </div>
  )
}
