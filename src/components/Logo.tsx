import { DuoMark } from './Mascot'

// 印（アニとペアの頭。components/Mascot.tsx）と「Anipair」の文字。上の帯（小）と最初の画面（大）で使う。
// 印は画面の中に直接描く（アンテナの線を地の文字の色にして、暗い地でも見えるように）。字は Quicksand（index.html で「Anipair」の字だけ読む）
export function Logo({ size }: { size: 'small' | 'large' }) {
  return (
    <span className={`logo logo--${size}`}>
      <DuoMark className="logo__mark" />
      <span className="logo__text">Anipair</span>
    </span>
  )
}
