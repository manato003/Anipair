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

// 見たけど覚えていない・見終わった
export function CheckIcon() {
  return (
    <Icon>
      <path d="m4.5 12.5 5 5 10-11" />
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

// 一時中断
export function PauseIcon() {
  return (
    <Icon>
      <path d="M9 5.5v13" />
      <path d="M15 5.5v13" />
    </Icon>
  )
}

// 視聴中止
export function StopIcon() {
  return (
    <Icon>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
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
