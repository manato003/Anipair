import { useState } from 'react'
import { navigate } from '../lib/navigate'
import { publishNotice, useNotices, withdrawNotice } from '../lib/notices'
import { previewTitleToast } from '../features/achievements/titleToast'
import { RARITIES, RARITY_LABEL } from '../features/achievements/titles'
import { HelpButton, type HelpTopic } from './Help'
import { ControlsIcon } from './Icons'
import { QuickSettings } from './QuickSettings'
import { Sheet } from './Sheet'

// 画面の見出しの右上: 使い方の「?」と、コントロールセンター（知らせとクイック設定）。
// よく使う方を右端（親指と、PC の操作が集まる側）に置く。知らせの数もここに出るので、コントロールセンターが右端
export function HeadActions(props: { topic: HelpTopic; active?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <span className="headactions">
      <HelpButton topic={props.topic} active={props.active} onOpenChange={props.onOpenChange} />
      <NoticesBell active={props.active} onOpenChange={props.onOpenChange} />
    </span>
  )
}

// コントロールセンター。知らせと、よく変える表示の設定（クイック設定）を、画面を離れずに開く（PS5 のコントロールセンターの考え方）。
// 設定の画面へ移るのは「設定を開く」を押したときだけ（近道で移ると、閉じたあとに元の画面に戻れなかった）
export function NoticesBell(props: { active?: boolean; onOpenChange?: (open: boolean) => void }) {
  const notices = useNotices()
  const [open, setOpen] = useState(false)
  const change = (next: boolean) => {
    setOpen(next)
    props.onOpenChange?.(next)
  }
  return (
    <>
      <button type="button" className="bell" aria-label={notices.length > 0 ? `コントロールセンター（知らせ ${notices.length}件）` : 'コントロールセンター'} onClick={() => change(true)}>
        <ControlsIcon />
        {notices.length > 0 && <b className={notices.some((n) => n.urgent) ? 'bell__count bell__count--urgent' : 'bell__count'}>{notices.length}</b>}
      </button>
      {open && (
        <Sheet label="コントロールセンター" active={props.active} onClose={() => change(false)}>
          <section className="cc">
            <h2 className="cc__title">コントロールセンター</h2>
            <h3 className="cc__sub">知らせ</h3>
            {notices.length === 0 ? (
              <p className="cc__empty">いま知らせはありません。保存できなかった記録や、読み直せなかったときは、ここに出ます。</p>
            ) : (
              <ul className="cc__cards">
                {notices.map((n) => (
                  <li key={n.id} className={n.urgent ? 'cc__card cc__card--urgent' : 'cc__card'}>
                    <b>{n.title}</b>
                    {n.body && <p>{n.body}</p>}
                    {n.action && (
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => {
                          n.action?.run()
                        }}
                      >
                        {n.action.label}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="cc__sub">表示</h3>
            <QuickSettings />
            {__GOD_MODE__ && <GodTools onClose={() => change(false)} />}
            <button
              type="button"
              className="link cc__all"
              onClick={() => {
                change(false)
                navigate({ tab: 'settings' })
              }}
            >
              設定を開く
            </button>
          </section>
        </Sheet>
      )}
    </>
  )
}

// God モード（preview と開発のビルドだけ。本番には出さない）: 称号の知らせと、知らせのカードを試しに出す。何も保存しない
function GodTools(props: { onClose: () => void }) {
  const [n, setN] = useState(0)
  const sample = (id: string, title: string, body: string, urgent: boolean) =>
    publishNotice({ id, title, body, urgent, action: { label: '消す', run: () => withdrawNotice(id) } })
  return (
    <div className="cc__god">
      <h3 className="cc__sub">God モード（試し表示。preview だけ・何も保存しません）</h3>
      <div className="cc__godactions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            // シートを閉じて、いまの画面の上で知らせを見る。押すたびにレア度を替え、3回に1回は「ほか2つ」を付ける
            const rarity = RARITIES[n % RARITIES.length]
            props.onClose()
            previewTitleToast(`試しの称号（${RARITY_LABEL[rarity]}）`, rarity, n % 3 === 2 ? 2 : 0)
            setN(n + 1)
          }}
        >
          称号の知らせ
        </button>
        <button type="button" className="btn" onClick={() => sample('god-plain', '試しの知らせ', '保存できなかった記録や、読み直せなかったときに、このように並びます。', false)}>
          知らせ（ふつう）
        </button>
        <button type="button" className="btn" onClick={() => sample('god-urgent', '試しの急ぎの知らせ', 'ログインが切れたときなど、急ぐものはこの印で並びます。', true)}>
          知らせ（急ぎ）
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            withdrawNotice('god-plain')
            withdrawNotice('god-urgent')
          }}
        >
          試しの知らせを消す
        </button>
      </div>
    </div>
  )
}
