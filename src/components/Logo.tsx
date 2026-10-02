// 印（2つの円と星）と「Anipair」の文字。上の帯（小）と最初の画面（大）で使う。
// 字は Quicksand（index.html で「Anipair」の字だけ読む）。見出しの Dela Gothic とは別
export function Logo({ size }: { size: 'small' | 'large' }) {
  return (
    <span className={`logo logo--${size}`}>
      <img className="logo__mark" src="/logo-mark.svg" alt="" />
      <span className="logo__text">Anipair</span>
    </span>
  )
}
