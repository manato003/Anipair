import { useState } from 'react'
import { Sheet } from '../../components/Sheet'
import { t } from '../../lib/i18n'
import { tellOnce } from '../../lib/tips'
import { MEMO_MAX } from './wannaNotes'

// 見たいの作品の「優先して見る」とメモを書くシート。メモは Anipair の中だけ（Annict には送らない。GitHub と連携していれば共有する）
export function WannaNoteSheet(props: {
  title: string
  priority: boolean
  memo: string
  // 連携している GitHub のリポジトリ（無ければ null）。初めて保存したときの知らせに、保存先を名前で出す
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
    // 保存先は画面に出ないので、初めて保存したときに一度だけ知らせる
    tellOnce(
      'wannaNote',
      props.githubRepo
        ? t(
            `メモはAnnictには送らず、GitHub（${props.githubRepo}）に保存して、ほかの端末と共有します。`,
            `Notes aren’t sent to Annict. They’re saved to GitHub (${props.githubRepo}) to share with your other devices.`,
          )
        : t(
            'メモはAnnictには送らず、この端末だけに残ります。設定でGitHubと連携すると、ほかの端末と共有できます。',
            'Notes aren’t sent to Annict and stay on this device only. Connect GitHub in Settings to share them with your other devices.',
          ),
    )
  }
  return (
    <Sheet label={t('見たいのメモ', 'Want-to-watch note')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{props.title}</h2>
      <section className="filtersheet__group">
        <button type="button" className="chip" aria-pressed={priority} onClick={() => setPriority((p) => !p)}>
          {priority ? t('★ 優先して見る', '★ Watch first') : t('☆ 優先して見る', '☆ Watch first')}
        </button>
      </section>
      <label className="review__body filtersheet__group">
        <span className="review__axis-name">{t('メモ', 'Note')}</span>
        <textarea
          value={memo}
          rows={4}
          maxLength={MEMO_MAX}
          placeholder={t('例: 友達のおすすめ・2期の前に見る', 'e.g. A friend’s recommendation; watch before season 2')}
          onChange={(e) => setMemo(e.target.value)}
        />
      </label>
      {/* 消すのはメモの文だけ（シートを閉じるのではない）。入力欄のすぐ下に、消す操作と分かる色で置く */}
      {memo && (
        <button type="button" className="link link--danger wannanote__clear" onClick={() => setMemo('')}>
          {t('メモを消す', 'Clear note')}
        </button>
      )}
      <p className="note">{t(`${MEMO_MAX}字まで`, `Up to ${MEMO_MAX} characters`)}</p>
      <div className="filtersheet__foot filtersheet__foot--end">
        <button type="button" className="btn btn--primary" onClick={save}>
          {t('保存', 'Save')}
        </button>
      </div>
    </Sheet>
  )
}
