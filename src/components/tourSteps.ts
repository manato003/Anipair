// 画面の上で示す使い方（Tour.tsx）の手順と、今の画面で示せる手順の選び方
// steps の target は root の中の CSS セレクター。今の画面に無い・見えていないものは飛ばす（例: マッチングの提案前は答えのボタンが無い）。
// 並べたときは、前から順に試して最初に見えているものを示す（PC ではカードの枠が見えない箱になるので、表紙を示す、など）

export interface TourStep {
  target: string | readonly string[]
  title: string
  body: string
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

// 今の画面で見えている手順だけを残す
export function presentSteps(root: ParentNode, steps: readonly TourStep[]): PresentStep[] {
  const out: PresentStep[] = []
  for (const step of steps) {
    const targets = typeof step.target === 'string' ? [step.target] : step.target
    for (const target of targets) {
      const el = root.querySelector(target)
      if (el && visible(el)) {
        out.push({ step, el })
        break
      }
    }
  }
  return out
}

// 今の画面で示せる手順と、その要素
export interface PresentStep {
  step: TourStep
  el: Element
}
