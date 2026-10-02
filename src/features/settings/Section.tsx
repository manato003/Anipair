import type { ReactNode } from 'react'

// 設定の1つのまとまり。見出し・1行の説明・いまの状態・操作を、同じ順に並べる（長い説明は呼ぶ側で <details> に畳む）
export function Section(props: { id: string; title: string; summary?: ReactNode; status?: ReactNode; children?: ReactNode }) {
  return (
    <div id={props.id} className="settings__block settings__card">
      <h2 className="settings__title">{props.title}</h2>
      {props.summary && <p className="settings__summary">{props.summary}</p>}
      {props.status && <div className="settings__statusline">{props.status}</div>}
      {props.children}
    </div>
  )
}

// いまの状態を短く示す印（接続中・前回のバックアップなど）。tone で色を変える
export function StatusChip(props: { tone?: 'ok' | 'off'; children: ReactNode }) {
  return (
    <span className={`status-chip status-chip--${props.tone ?? 'ok'}`}>
      <span className="status-chip__dot" aria-hidden />
      {props.children}
    </span>
  )
}
