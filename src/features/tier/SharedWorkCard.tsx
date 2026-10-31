import { useEffect, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { ExternalIcon, InfoIcon, UserIcon } from '../../components/Icons'
import { Loading } from '../../components/Loading'
import { Phrase } from '../../components/Phrase'
import { Sheet } from '../../components/Sheet'
import { getLang, t } from '../../lib/i18n'
import { shikiTitle } from '../../lib/names'
import { studioName } from '../../lib/studios'
import { shikimoriUrl, type Media } from '../../lib/shikimori'
import { episodeFacts } from '../../lib/watchFacts'
import { fetchWikiSynopsis, type WikiSynopsis } from '../../lib/wikipedia'
import { fetchWorkLinks, type WorkLinks } from '../../lib/workLinks'
import { workMeta } from '../browse/detail'
import { VodSearchSection } from '../browse/VodSearchSection'
import { WikiSynopsisSection } from '../browse/WikiSynopsisSection'
import { genreName } from '../match/taste'

// 共有の Tier表で表紙を押したときの作品カード。ログインしていない人も見るので、Annict の API は使わない。
// 題名・表紙・要点・ジャンル・制作会社は表を出すときに読んだ Shikimori の情報、あらすじ・公式サイト・X は Wikidata でたどった
// Wikipedia の記事から（lib/workLinks.ts）。記録・スタッフ・声優・みんなの感想は Annict でログインした人の作品の詳細にだけある
// あらすじを探す記事の数（作品・シリーズ・原作の順に、あらすじの節がある記事まで）
const MAX_ARTICLES = 3
// Shikimori の形式を、作品の要点の書き方（Annict の形式の名前）に直す。分からない形式は書かない
const MEDIA: Record<string, string> = { TV: 'TV', MOVIE: 'MOVIE', OVA: 'OVA', ONA: 'WEB' }

export function SharedWorkCard(props: { media: Media; onClose: () => void }) {
  const m = props.media
  const title = shikiTitle(m.title, `MAL ${m.idMal}`)
  // 配信サービスと Annict の検索に入れる題名（日本のサービスなので日本語の題名を先に）
  const searchTitle = m.title.native || m.title.romaji || title
  const [links, setLinks] = useState<WorkLinks | null | undefined>(undefined)
  const [wiki, setWiki] = useState<WikiSynopsis | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const l = await fetchWorkLinks(m.idMal).catch(() => null)
      if (cancelled) return
      setLinks(l)
      for (const url of (l?.wikipedia ?? []).slice(0, MAX_ARTICLES)) {
        const w = await fetchWikiSynopsis(url).catch(() => null)
        if (cancelled) return
        if (w) return setWiki(w)
      }
      setWiki(null)
    })()
    return () => {
      cancelled = true
    }
  }, [m.idMal])

  const facts = [
    workMeta({ seasonYear: m.seasonYear, media: m.format ? MEDIA[m.format] : undefined }),
    ...episodeFacts({ format: m.format, status: m.status, episodes: m.episodes, episodesAired: m.episodesAired, duration: m.duration }),
  ].filter((f) => !!f)
  const genres = [...m.genres, ...m.themes].map(genreName)
  const wikipedia = links?.wikipedia[0] ?? null
  const official = links?.official ?? null
  const x = links?.x ? `https://x.com/${links.x}` : null

  return (
    <Sheet label={title} size="page" onClose={props.onClose}>
      <div className="detail detail--ready">
        <header className="detail__head">
          <div className="detail__cover">{m.cover && <CoverImage cover={m.cover} size="large" />}</div>
          <div className="detail__titles">
            <h2 className="detail__title">
              <Phrase text={title} />
            </h2>
            <div className="detail__late">
              {getLang() === 'en' && m.title.native && m.title.native !== title && <p className="detail__kana">{m.title.native}</p>}
              {facts.length > 0 && (
                <p className="detail__meta">
                  {facts.map((f) => (
                    <span key={f} className="fact">
                      {f}
                    </span>
                  ))}
                </p>
              )}
              {wiki === undefined && <Loading className="detail__pending" label={t('あらすじを読み込み中', 'Loading synopsis')} />}
            </div>
          </div>
        </header>

        <div className="detail__body">
          <div className="detail__late">
            {(genres.length > 0 || m.studios.length > 0 || wiki !== undefined) && (
              <section className="group">
                <h3 className="group__title">
                  <InfoIcon />
                  {t('作品について', 'About this anime')}
                </h3>
                {genres.length > 0 && (
                  <section className="detail__section">
                    <h3 className="detail__label">{t('ジャンル', 'Genre')}</h3>
                    <ul className="tags">
                      {genres.map((g) => (
                        <li key={g} className="tag">
                          {g}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {m.studios.length > 0 && (
                  <section className="detail__section">
                    <dl className="credits">
                      <div className="credits__row">
                        <dt>{t('制作会社', 'Studio')}</dt>
                        <dd>{m.studios.map(studioName).join(t('・', ', '))}</dd>
                      </div>
                    </dl>
                  </section>
                )}
                {wiki !== undefined && <WikiSynopsisSection wiki={wiki} />}
              </section>
            )}

            <section className="group">
              <h3 className="group__title">
                <ExternalIcon />
                {t('ほかのサイトで見る', 'View on other sites')}
              </h3>
              <VodSearchSection title={searchTitle} />
              <section className="detail__section">
                <h3 className="detail__label">{t('作品のページ', 'Anime pages')}</h3>
                <div className="detail__links">
                  {official && (
                    <a href={official} target="_blank" rel="noreferrer">
                      {t('公式サイト', 'Official site')}
                    </a>
                  )}
                  {wikipedia && (
                    <a href={wikipedia} target="_blank" rel="noreferrer">
                      Wikipedia
                    </a>
                  )}
                  {x && (
                    <a href={x} target="_blank" rel="noreferrer">
                      X
                    </a>
                  )}
                  <a href={`https://annict.com/search?q=${encodeURIComponent(searchTitle)}`} target="_blank" rel="noreferrer">
                    {t('Annictで探す', 'Find on Annict')}
                  </a>
                  <a href={shikimoriUrl(m.idMal)} target="_blank" rel="noreferrer">
                    {t('Shikimoriで見る', 'View on Shikimori')}
                  </a>
                </div>
              </section>
            </section>

            {/* ログインの案内。作品の情報を先に見せ、案内は最後に1回だけ */}
            <section className="group">
              <h3 className="group__title">
                <UserIcon />
                {t('記録する・もっと詳しく見る', 'Record it and see more')}
              </h3>
              <section className="detail__section">
                <p className="detail__text">
                  {t(
                    'Annictのアカウントでログインすると、この作品を記録・評価したり、スタッフ・声優やみんなの感想を見たりできます。自分のTier表も作れます。',
                    'Log in with your Annict account to record and rate this anime, see its staff, cast and reviews, and make your own tier list.',
                  )}
                </p>
                <a className="btn btn--primary sharedwork__cta" href="/">
                  {t('Annictでログインして使う', 'Log in with Annict')}
                </a>
              </section>
            </section>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
