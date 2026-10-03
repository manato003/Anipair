
// 利用規約とプライバシーポリシー（public/ の静的なページ）
export function LegalLinks(props: { className?: string }) {
  return (
    <p className={props.className}>
      <a href="/terms.html" target="_blank" rel="noreferrer">
        利用規約
      </a>
      <a href="/privacy.html" target="_blank" rel="noreferrer">
        プライバシーポリシー
      </a>
    </p>
  )
}
