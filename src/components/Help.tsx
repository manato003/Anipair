import { FAQ } from './faq'
import { t } from '../lib/i18n'
import { common, topics, type HelpTopic, type Item } from './helpContent'
import { Sheet } from './Sheet'

// 各画面の右上の「?」の、文章の使い方（HelpSheet）。開いた画面の使い方を一番上に、ほかの画面は畳んで並べる。
// 「?」のボタンと画面の上で示す使い方（Tour）は components/HelpButton.tsx

export type { HelpTopic } from './helpContent'


export function HelpSheet(props: { topic: HelpTopic; active?: boolean; onClose: () => void; onFeedback?: () => void }) {
  const all = topics()
  const current = all.find((x) => x.id === props.topic) ?? all[0]
  const others = all.filter((x) => x.id !== current.id)
  return (
    <Sheet label={t('使い方', 'How to use')} active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">{t('使い方', 'How to use')}</h2>
      <section className="help__section">
        <h3 className="help__heading">{t(`この画面（${current.title}）`, `This screen (${current.title})`)}</h3>
        <HelpList items={current.items} />
      </section>
      <section className="help__section">
        <h3 className="help__heading">{t('どの画面でも', 'On every screen')}</h3>
        <HelpList items={common()} />
      </section>
      <section className="help__section">
        <h3 className="help__heading">{t('ほかの画面', 'Other screens')}</h3>
        {others.map((x) => (
          <details key={x.id} className="help__more">
            <summary>{x.title}</summary>
            <HelpList items={x.items} />
          </details>
        ))}
      </section>
      <section className="help__section">
        <h3 className="help__heading">{t('よくある質問', 'FAQ')}</h3>
        {FAQ.map(([q, short, detail]) => (
          <details key={q} className="help__more">
            <summary>{q}</summary>
            <p className="help__answer">
              <strong>{short}</strong>
              {detail && (
                <>
                  <br />
                  {detail}
                </>
              )}
            </p>
          </details>
        ))}
        {props.onFeedback && (
          <p className="help__ask">
            {t('ここに無い質問や、不具合・要望は', 'Questions not covered here, bug reports, and requests:')}{' '}
            <button type="button" className="link" onClick={props.onFeedback}>
              {t('質問・不具合・要望を送る', 'Send feedback')}
            </button>
          </p>
        )}
      </section>
      <p className="help__thanks">
        {t(
          'Anipairを使っていただき、ありがとうございます。迷ったときは、いつでも右上の「?」を押してください。',
          'Thank you for using Anipair. If you ever get stuck, tap the “?” at the top right at any time.',
        )}
      </p>
    </Sheet>
  )
}

function HelpList({ items }: { items: readonly Item[] }) {
  return (
    <dl className="help__list">
      {items.map(([head, body]) => (
        <div key={head} className="help__item">
          <dt>{head}</dt>
          <dd>{body}</dd>
        </div>
      ))}
    </dl>
  )
}
