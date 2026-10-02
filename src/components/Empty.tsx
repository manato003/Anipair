import type { ReactNode } from 'react'

export function Empty(props: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{props.title}</p>
      <p className="empty__body">{props.body}</p>
      {props.children}
    </div>
  )
}
