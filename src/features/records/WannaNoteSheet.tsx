import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { MEMO_MAX } from './wannaNotes'

// 見たいの作品の「優先して見る」とメモを書くシート。メモは Anipair の中だけ（Annict には送らない。GitHub と連携していれば共有する）
export function WannaNoteSheet(props: {
  title: string
  priority: boolean
  memo: string
  // 連携している GitHub のリポジトリ（無ければ null）。共有するかの説明に、保存先を名前で出す
  githubRepo: string | null
  active: boolean
  onSave: (value: { priority: boolean; memo: string }) => void
  onClose: () => void
}) {
  const [priority, setPriority] = useState(props.priority)
  const [memo, setMemo] = useState(props.memo)
  const save = () => {
    props.onSave({ priority, memo })
    props.onClose()
  }
  return (
    <Sheet label="見たいのメモ" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{props.title}</h2>
      <section className="filtersheet__group">
        <button type="button" className="chip" aria-pressed={priority} onClick={() => setPriority((p) => !p)}>
          {priority ? '★ 優先して見る' : '☆ 優先して見る'}
        </button>
        <p className="note filtersheet__lead">付けた作品は、見たいの一覧でいちばん上に並びます。</p>
      </section>
      <label className="review__body filtersheet__group">
        <span className="review__axis-name">メモ</span>
        <textarea
          value={memo}
          rows={4}
          maxLength={MEMO_MAX}
          placeholder="例: 友達のおすすめ・2期の前に見る"
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      {/* 消すのはメモの文だけ（シートを閉じるのではない）。入力欄のすぐ下に、消す操作と分かる色で置く */}
      {memo && (
        <button type="button" className="link link--danger wannanote__clear" onClick={() => setMemo('')}>
          メモを消す
        </button>
      )}
      <p className="note">
        {MEMO_MAX}字まで。メモは Anipair の中だけに残し、Annict には送りません。
        {props.githubRepo
          ? `GitHub（${props.githubRepo}）に保存して、ほかの端末と共有します。`
          : 'この端末だけに残ります（設定で GitHub と連携すると、ほかの端末と共有できます）。'}
      </p>
      <div className="filtersheet__foot filtersheet__foot--end">
        <button type="button" className="btn btn--primary" onClick={save}>
          保存
        </button>
      </div>
    </Sheet>
  )
}
