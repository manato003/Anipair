import { Sheet } from './Sheet'

// 「Anipair の使い方」。初めて評価の画面を開いたときに1回だけ出し、設定の「このアプリについて」からいつでも見直せる。
// どう閉じても（はじめる・閉じる・Esc・背景・戻る）、閉じたら onClose を呼ぶ
export function UsageGuide(props: { active?: boolean; onClose: () => void }) {
  return (
    <Sheet label="Anipair の使い方" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">Anipair の使い方</h2>
      <ol className="guide__steps">
        <li>
          <strong>見た作品を評価する</strong>
          見てる作品と、クールをさかのぼった作品が順に出てきます。見た作品は4段階で評価し、内容を覚えていなければ「覚えてない」。見ていなければ「見てない」、気になれば「見たい」。
        </li>
        <li>10件ほど好きな作品を評価すると、マッチングで好みに合う作品を提案します。</li>
        <li>記録はすべてあなたの Annict に保存されます。</li>
      </ol>
      <div className="guide__actions">
        <button type="button" className="btn btn--primary" onClick={props.onClose}>
          はじめる
        </button>
      </div>
    </Sheet>
  )
}
