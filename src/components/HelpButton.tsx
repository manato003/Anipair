import { lazy, Suspense, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../lib/i18n'
import type { HelpTopic } from './helpContent'
import { HelpIcon } from './Icons'
import type { PresentStep } from './tourSteps'

// 画面の見出しの右端に置く「?」。押すと、まず画面の上で示す使い方（Tour）を出し、ボタンを1つずつ明るくして説明する。
// 「文章で詳しく読む」で、文章の使い方（HelpSheet）に切り替える。onOpenChange は、開いているあいだ画面のキー操作を止めるため（評価・マッチング）。
// 中身（手順・文章・よくある質問・問い合わせ）は押したときに読む（最初に読む JS を小さくする。2026-10-21）。
// App が手の空いたときに先に読んでおくので、ふだんは待たない。
// 案内もシートも画面の一番外（body）に出す。画面の中の重なりの順（z-index）に隠されないように
const Tour = lazy(() => import('./Tour').then((m) => ({ default: m.Tour })))
const HelpSheet = lazy(() => import('./Help').then((m) => ({ default: m.HelpSheet })))
const FeedbackSheet = lazy(() => import('./FeedbackSheet').then((m) => ({ default: m.FeedbackSheet })))

type Mode = { kind: 'tour'; steps: readonly PresentStep[] } | { kind: 'text' } | { kind: 'feedback' } | null

export function HelpButton(props: { topic: HelpTopic; active?: boolean; onOpenChange?: (open: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<Mode>(null)
  const change = (next: Mode) => {
    setMode(next)
    props.onOpenChange?.(next !== null)
  }
  const open = async () => {
    const root = ref.current?.closest('.app__screen, main') ?? document
    let steps: readonly PresentStep[] = []
    try {
      steps = (await import('./helpContent')).tourFor(root, props.topic)
    } catch {
      // 読めなければ文章の使い方へ（シートの読み込みが失敗すれば、ErrorBoundary が読み直しを促す）
    }
    // 示せるボタンが1つも無いとき（読み込み中など）は、文章の使い方を出す
    change(steps.length > 0 ? { kind: 'tour', steps } : { kind: 'text' })
  }
  return (
    <>
      <button ref={ref} type="button" className="helpbtn" aria-label={t('使い方', 'How to use')} title={t('使い方', 'How to use')} onClick={() => void open()}>
        <HelpIcon />
      </button>
      <Suspense fallback={null}>
        {mode?.kind === 'tour' && <Tour label={t('使い方', 'How to use')} steps={mode.steps} onClose={() => change(null)} onText={() => change({ kind: 'text' })} />}
        {mode?.kind === 'text' &&
          createPortal(
            <HelpSheet topic={props.topic} active={props.active} onClose={() => change(null)} onFeedback={() => change({ kind: 'feedback' })} />,
            document.body,
          )}
        {mode?.kind === 'feedback' && createPortal(<FeedbackSheet active={props.active} onClose={() => change(null)} />, document.body)}
      </Suspense>
    </>
  )
}
