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

// 感想を書く（吹き出し）
export function CommentIcon() {
  return (
    <Icon>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
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

// 絞り込み（漏斗）
export function FilterIcon() {
  return (
    <Icon>
      <path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z" />
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

// ── 評価とマッチングの答えのボタン。名前は隣に添えるか、設定で隠す ──

// 見てる（再生）
export function PlayIcon() {
  return (
    <Icon>
      <path d="M8 5v14l11-7z" />
    </Icon>
  )
}

// 視聴中断（一時停止）
export function PauseIcon() {
  return (
    <Icon>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </Icon>
  )
}

// 見てない（目に斜線）
export function EyeOffIcon() {
  return (
    <Icon>
      <path d="M10 4.2A9 9 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2" />
      <path d="M6.6 6.6A17 17 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
      <path d="M3 3l18 18" />
    </Icon>
  )
}

// 興味なし（候補から外す。内部の名前は pass）
export function PassIcon() {
  return (
    <Icon>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  )
}

// 保留（今は決めない。1週間後にまた。内部の名前は later・skip）
export function LaterIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

// 評価の4段階と「覚えてない」。良くない・良いは親指、普通は横線、とても良いはハート（表情は使わない）
export function RatingIcon({ rating }: { rating: 'NONE' | 'BAD' | 'AVERAGE' | 'GOOD' | 'GREAT' }) {
  switch (rating) {
    case 'NONE':
      return <HelpIcon />
    case 'BAD':
      return (
        <Icon>
          <path d="M17 14V2" />
          <path d="M9 18.1 10 14H4.2a2 2 0 0 1-1.9-2.6l2.3-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.8a2 2 0 0 0-1.8 1.1L12 22a3.1 3.1 0 0 1-3-3.9Z" />
        </Icon>
      )
    case 'AVERAGE':
      return (
        <Icon>
          <path d="M5 12h14" />
        </Icon>
      )
    case 'GOOD':
      return (
        <Icon>
          <path d="M7 10v12" />
          <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8a2 2 0 0 1-1.9 1.4H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z" />
        </Icon>
      )
    case 'GREAT':
      return (
        <Icon>
          <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />
        </Icon>
      )
  }
}

// 答えのボタンの名前。設定の「ボタンの表示」でアイコンだけにしたときは、見た目から隠して読み上げには残し、
// PC ではマウスを重ねたときに出す（base.css の [data-buttons]）
export function ActLabel({ children }: { children: ReactNode }) {
  return <span className="act__label">{children}</span>
}

// 外のサイトを開く（↗）
export function ExternalIcon() {
  return (
    <Icon>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </Icon>
  )
}

// 知らせ（コントロールセンター）
export function BellIcon() {
  return (
    <Icon>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </Icon>
  )
}

// 見た（チェック）
export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  )
}

// まとめ・傾向（棒の図）
export function ChartIcon() {
  return (
    <Icon>
      <path d="M5 19.5V11" />
      <path d="M10 19.5V5" />
      <path d="M15 19.5v-6" />
      <path d="M20 19.5V9" />
    </Icon>
  )
}

// ふり返り（暦）
export function CalendarIcon() {
  return (
    <Icon>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M8.5 3.5v4" />
      <path d="M15.5 3.5v4" />
    </Icon>
  )
}

// アカウント（人）
export function UserIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" />
    </Icon>
  )
}

// 表示（絵の具の板）
export function PaletteIcon() {
  return (
    <Icon>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.9 0-1.4-1.2-1.8-1.2-3 0-1 .8-1.6 1.9-1.6h2.1a3.7 3.7 0 0 0 3.7-3.7c0-3.8-3.8-6.8-8.5-6.8Z" />
      <path d="M7.5 11h.1" />
      <path d="M10 7.3h.1" />
      <path d="M14.6 7.6h.1" />
    </Icon>
  )
}

// バックアップ（箱）
export function BoxIcon() {
  return (
    <Icon>
      <path d="M4 8.5h16v11H4z" />
      <path d="M3 4.5h18v4H3z" />
      <path d="M10 12.5h4" />
    </Icon>
  )
}

// キー（鍵盤のキー）
export function KeyIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10h.1" />
      <path d="M11 10h.1" />
      <path d="M15 10h.1" />
      <path d="M8 14.5h8" />
    </Icon>
  )
}

// コントロールセンター（つまみの並び。知らせとクイック設定）
export function ControlsIcon() {
  return (
    <Icon>
      <path d="M4 7h9" />
      <path d="M17 7h3" />
      <circle cx="15" cy="7" r="2" />
      <path d="M4 17h3" />
      <path d="M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </Icon>
  )
}

// いちばん上へ
export function UpIcon() {
  return (
    <Icon>
      <path d="M5.5 14.5 12 8l6.5 6.5" />
    </Icon>
  )
}

// 閉じる
export function CloseIcon() {
  return (
    <Icon>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  )
}

// スタッフ・キャスト（人が2人）
export function PeopleIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17 13.6a5.5 5.5 0 0 1 3.5 5.4" />
    </Icon>
  )
}
