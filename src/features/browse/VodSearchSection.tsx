import { ExternalIcon } from '../../components/Icons'
import { t } from '../../lib/i18n'
import { vodSearchLinks } from '../../lib/vodSearch'

// 配信サービスの検索への入り口（配信しているかは確かめない。lib/vodSearch.ts）。作品の詳細と、共有の Tier表の作品カードで使う
export function VodSearchSection(props: { title: string }) {
  const links = vodSearchLinks(props.title)
  if (links.length === 0) return null
  return (
    <section className="detail__section">
      <h3 className="detail__label">{t('配信サービスで探す', 'Search on streaming services')}</h3>
      <div className="vods">
        {links.map((l) => (
          <a key={l.name} className="chip chip--link" href={l.href} target="_blank" rel="noreferrer">
            {l.name}
            <ExternalIcon />
          </a>
        ))}
      </div>
      <p className="detail__hint">{t('各サービスで題名を検索します。配信していない作品もあります。', 'Searches each service by title. Some anime may not be available.')}</p>
    </section>
  )
}
