import type { ReactNode } from 'react'
import { Phrase } from './Phrase'

// 作品の無いあいだの案内（見出し・説明・操作）。見出しと説明は語の途中で折らない
export function Empty(props: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty">
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
