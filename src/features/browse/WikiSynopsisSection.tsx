import { useState } from 'react'
import { t } from '../../lib/i18n'
import type { WikiSynopsis } from '../../lib/wikipedia'

// あらすじ: Wikipedia の冒頭の段落（ネタバレを避ける）。続きは押したときだけ、その場で広げる。出典とライセンス（CC BY-SA 4.0）を添える。
// 作品の詳細と、共有の Tier表の作品カードで使う
export function WikiSynopsisSection(props: { wiki: WikiSynopsis }) {
  const { wiki } = props
  const [open, setOpen] = useState(false)
  return (
    <section className="detail__section">
      <h3 className="detail__label">{wiki.lang === 'en' ? 'Synopsis' : t('あらすじ', 'Synopsis (from Japanese Wikipedia)')}</h3>
      {open ? (
        <div className="detail__wiki">
          {wiki.blocks.map((b, i) =>
            b.heading ? (
              <h4 key={i} className="detail__wiki-heading">
                {b.text}
              </h4>
            ) : (
              <p key={i} className="detail__text">
                {b.text}
              </p>
            ),
          )}
        </div>
      ) : (
        <p className="detail__text">{wiki.text}</p>
      )}
      {(wiki.blocks.length > 1 || wiki.text.endsWith('…')) && (
        // 右端に置く（親指の届く側）。注意書きはボタンのすぐ左
        <p className="detail__more">
          {!open && <span className="detail__spoiler">{t('ネタバレを含むことがあります', 'May contain spoilers')}</span>}
          <button type="button" className="link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? t('続きを閉じる', 'Show less') : t('続きを読む', 'Read more')}
          </button>
        </p>
      )}
      <p className="detail__source">
        {t('出典: Wikipedia「', 'Source: Wikipedia “')}
        <a href={wiki.url} target="_blank" rel="noreferrer">
          {wiki.title}
        </a>
        {t('」（', '” (')}
        <a href={wiki.licenseUrl} target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        {t('）', ')')}
      </p>
    </section>
  )
}
