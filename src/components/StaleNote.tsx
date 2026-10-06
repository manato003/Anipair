import { useEffect, useState } from 'react'
import { storedAtLabel } from '../lib/offlineCache'
import { Spinner } from './Loading'

// 前回の内容（端末にとっておいた Annict のデータ）で画面を出しているあいだの一言。画面の下に浮かべ、画面の流れには入れない。
// 普段は読み直しが1秒ほどで終わるので、5秒たっても終わらないときだけ出す（出ては消えるちらつきを防ぐ）。
// 読み直しに失敗したときはすぐ出し、「もう一度」を付ける
const SHOW_AFTER_MS = 5000

export function StaleNote(props: { at: string | null; error: string | null; onRetry?: () => void }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!props.at) return
    const t = window.setTimeout(() => setSlow(true), SHOW_AFTER_MS)
    return () => {
      window.clearTimeout(t)
      setSlow(false)
    }
  }, [props.at])
  if (!props.at) return null
  if (props.error) {
    return (
      <div className="stale-toast stale-toast--error" role="alert">
        <span>
          Annict から読み直せませんでした（{props.error}）。前回（{storedAtLabel(props.at)}）の内容を表示しています。
        </span>
        {props.onRetry && (
          <button type="button" className="link" onClick={props.onRetry}>
            もう一度
          </button>
        )}
      </div>
    )
  }
  if (!slow) return null
  return (
    <div className="stale-toast" role="status">
      <Spinner />
      <span>Annict が混み合っているようです。前回（{storedAtLabel(props.at)}）の内容を表示しながら読み直しています。</span>
    </div>
  )
}
