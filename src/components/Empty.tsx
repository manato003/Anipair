import type { ReactNode } from 'react'
import { CheerScene, EmptyScene, ProposeScene, TroubleScene } from './Mascot'
import { Phrase } from './Phrase'

// 作品の無いあいだの案内（見出し・説明・操作）。見出しと説明は語の途中で折らない。
// mood: 上に出すアニとペアの絵（empty 空っぽ・trouble うまくいかなかった・done やりきった・propose これから見つける）
export type EmptyMood = 'empty' | 'trouble' | 'done' | 'propose'

const ART: Record<EmptyMood, (p: { className?: string }) => ReactNode> = {
  empty: EmptyScene,
  trouble: TroubleScene,
  done: CheerScene,
  propose: ProposeScene,
}

export function Empty(props: { title: string; body: string; mood?: EmptyMood; children?: ReactNode }) {
  const Art = props.mood ? ART[props.mood] : null
  return (
    <div className="empty">
      {Art && <Art className="scene-art empty__art" />}
      <p className="empty__title">
        <Phrase text={props.title} />
      </p>
      <p className="empty__body">
        <Phrase text={props.body} />
      </p>
      {props.children}
    </div>
  )
}
