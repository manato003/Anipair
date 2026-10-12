import type { ReactNode } from 'react'

// 設定の1つのまとまり。見出し・1行の説明・いまの状態・操作を、同じ順に並べる（長い説明は呼ぶ側で <details> に畳む）。
// 見出しは、設定のまとまり（h2）の中なので h3。ログイン前の最初の画面では、ページの見出し（h1）のすぐ下なので h2 にする（level）
// title が無いまとまりは、下の SettingRow を並べるだけ（表示のように、行が続いて1つの一覧に見えるもの）
export function Section(props: { id: string; title?: string; level?: 2 | 3; summary?: ReactNode; status?: ReactNode; children?: ReactNode }) {
  const Heading = props.level === 2 ? 'h2' : 'h3'
  return (
    <div id={props.id} className={props.title ? 'settings__block settings__card' : 'settings__block settings__card settings__card--rows'}>
      {props.title && <Heading className="settings__title">{props.title}</Heading>}
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

// 1つの設定を1行に。名前と1行の補足（20字前後まで。長い説明は置かない）が左、操作が右（スマホは名前の下）。
// 行のあいだは細い線で区切る（設定の画面は箱で囲まない。2026-10-13 #30: 説明が長く、どれが操作か分かりにくかった）
export function SettingRow(props: { label: string; hint?: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <p className="setting-row__label">{props.label}</p>
        {props.hint && <p className="setting-row__hint">{props.hint}</p>}
      </div>
      <div className="setting-row__control">{props.children}</div>
      {props.after && <div className="setting-row__after">{props.after}</div>}
    </div>
  )
}
