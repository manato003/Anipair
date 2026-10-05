import type { ReactNode } from 'react'

// 補助ボタンに添える小さな線のアイコン。意味は隣の文字が持つので、読み上げからは外す（aria-hidden）
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

// 取り消す
export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  )
}

// 詳しく
export function InfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.1" />
    </Icon>
  )
}

// 使い方（各画面の右上の「?」）
export function HelpIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 0 1 4.85.85c0 1.65-2.45 2.15-2.45 3.7" />
      <path d="M12 17v.1" />
    </Icon>
  )
}

// 見たことがある
export function EyeIcon() {
  return (
    <Icon>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </Icon>
  )
}

// 戻る
export function BackIcon() {
  return (
    <Icon>
      <path d="M15 5.5 8.5 12l6.5 6.5" />
    </Icon>
  )
}

// 記録の一覧（記録タブの「記録｜実績」の切り替え）
export function ListIcon() {
  return (
    <Icon>
      <path d="M9 6.5h11" />
      <path d="M9 12h11" />
      <path d="M9 17.5h11" />
      <path d="M4.5 6.5h.1" />
      <path d="M4.5 12h.1" />
      <path d="M4.5 17.5h.1" />
    </Icon>
  )
}

// 実績（トロフィー）
export function TrophyIcon() {
  return (
    <Icon>
      <path d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0v-5Z" />
      <path d="M7.5 6.5H4.5a3 3 0 0 0 3 4" />
      <path d="M16.5 6.5h3a3 3 0 0 1-3 4" />
      <path d="M12 14v3.5" />
      <path d="M8.5 20h7" />
      <path d="M9.5 17.5h5V20h-5z" />
    </Icon>
  )
}

// 下のタブのアイコン。選んでいるタブは塗り、ほかは線だけにして、色のほかに形でも今の画面が分かるようにする。
// 塗ったときに抜く部分（記録の行・設定の穴）は、タブの帯の地の色（--tabs-bg）で描く
export type TabIconName = 'rate' | 'match' | 'records' | 'browse' | 'settings'

export function TabIcon({ name, active }: { name: TabIconName; active: boolean }) {
  const fill = active ? 'currentColor' : 'none'
  return (
    <svg className="tabs__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {name === 'rate' && (
        <path fill={fill} d="M12 3.1 14.41 9.08 20.84 9.53 15.9 13.67 17.47 19.92 12 16.5 6.53 19.92 8.1 13.67 3.16 9.53 9.59 9.08Z" />
      )}
      {name === 'match' && (
        <path fill={fill} d="M12 20.2C6.2 16.4 3.2 13.1 3.2 9.4a4.4 4.4 0 0 1 8.8-1.6 4.4 4.4 0 0 1 8.8 1.6c0 3.7-3 7-8.8 10.8Z" />
      )}
      {name === 'records' && (
        <>
          <rect fill={fill} x="5" y="3.5" width="14" height="17" rx="2.2" />
          <path className={active ? 'tabs__cut' : undefined} d="M8.6 9h6.8M8.6 12.5h6.8M8.6 16h4.2" />
        </>
      )}
      {name === 'browse' && (
        <>
          <rect fill={fill} x="3.8" y="3.8" width="6.8" height="6.8" rx="1.6" />
          <rect fill={fill} x="13.4" y="3.8" width="6.8" height="6.8" rx="1.6" />
          <rect fill={fill} x="3.8" y="13.4" width="6.8" height="6.8" rx="1.6" />
          <rect fill={fill} x="13.4" y="13.4" width="6.8" height="6.8" rx="1.6" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path
            fill={fill}
            d="M9.53 4.81 9.75 2.26h4.5l.22 2.55.86.36 1.97-1.65 3.18 3.18-1.65 1.97.36.86 2.55.22v4.5l-2.55.22-.36.86 1.65 1.97-3.18 3.18-1.97-1.65-.86.36-.22 2.55h-4.5l-.22-2.55-.86-.36-1.97 1.65-3.18-3.18 1.65-1.97-.36-.86-2.55-.22v-4.5l2.55-.22.36-.86-1.65-1.97 3.18-3.18 1.97 1.65Z"
          />
          <circle className={active ? 'tabs__cut' : undefined} cx="12" cy="12" r="3.2" />
        </>
      )}
    </svg>
  )
}
