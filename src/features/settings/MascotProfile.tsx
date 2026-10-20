import { AniFigure, PairFigure } from '../../components/Mascot'
import { Sheet } from '../../components/Sheet'
import { t } from '../../lib/i18n'
import { seasonNameLabel, type SeasonName } from '../../lib/season'

// © 2026 manato003. アニとペアのデザイン・絵・名前・設定は、MIT ライセンスの対象外です（著作権を保持。LICENSE の「例外」）。
//
// 「アニとペアのこと」。アプリのマスコット2人の、生まれ・生態・好きなもの（設定の「このアプリ」から開く）

const SEASONS: SeasonName[] = ['spring', 'summer', 'autumn', 'winter']

function Row(props: { term: string; children: string }) {
  return (
    <div className="mascotprofile__row">
      <dt>{props.term}</dt>
      <dd>{props.children}</dd>
    </div>
  )
}

export function MascotProfile(props: { onClose: () => void }) {
  return (
    <Sheet label={t('アニとペアのこと', 'About Ani & Pair')} size="page" onClose={props.onClose}>
      <article className="mascotprofile">
        <h2 className="mascotprofile__title">{t('アニとペアのこと', 'About Ani & Pair')}</h2>
        <p className="mascotprofile__lead">
          {t(
            'Anipairの名前を2つに割ると、アニとペア。アニが見て、ペアが見つける。2人でひとつのAnipairです。',
            'Split the name Anipair in two and you get Ani and Pair. Ani watches, Pair finds. Together, they’re Anipair.',
          )}
        </p>

        <section className="group mascotprofile__card">
          <svg className="mascot mascotprofile__figure" viewBox="0 0 120 120" aria-hidden>
            <AniFigure expr="happy" />
          </svg>
          <div>
            <h3 className="group__title">{t('アニ', 'Ani')}</h3>
            <dl className="mascotprofile__list">
              <Row term={t('係', 'Job')}>{t('アニメを見る係。', 'Watches the anime.')}</Row>
              <Row term={t('生まれ', 'Born')}>
                {t(
                  '深夜アニメの放送が終わったあと、テレビの砂嵐の向こうからやってきた。頭のアンテナは、そのときから付いている。',
                  'Showed up from beyond the TV static after a late-night anime signed off. The antenna on its head has been there ever since.',
                )}
              </Row>
              <Row term={t('生態', 'Habits')}>
                {t(
                  '夜になると元気になる（深夜は眠そうな顔で出てくるが、本人は起きているつもり）。アンテナで今期の作品を受信する。気持ちはアンテナに出て、受信中は揺れ、困ると曲がる。',
                  'Perks up at night (it turns up looking sleepy in the dead of night, but it insists it’s wide awake). Picks up this season’s anime with its antenna. Its feelings show in the antenna: it wobbles while receiving and droops when Ani is in trouble.',
                )}
              </Row>
              <Row term={t('好きなもの', 'Likes')}>{t('深夜アニメ、新番組の第1話、最終回の余韻、こたつ。', 'Late-night anime, first episodes of new shows, the afterglow of a finale, a warm kotatsu.')}</Row>
              <Row term={t('苦手なもの', 'Dislikes')}>{t('ネタバレ、録り逃し。', 'Spoilers, missed recordings.')}</Row>
              <Row term={t('口ぐせ', 'Catchphrase')}>{t('「受信中…」', '“Receiving…”')}</Row>
              <Row term={t('大きさ', 'Size')}>{t('セル画を縦に1枚ぶん。', 'One animation cel tall.')}</Row>
            </dl>
          </div>
        </section>

        <section className="group mascotprofile__card">
          <svg className="mascot mascotprofile__figure" viewBox="0 0 120 120" aria-hidden>
            <PairFigure expr="happy" />
          </svg>
          <div>
            <h3 className="group__title">{t('ペア', 'Pair')}</h3>
            <dl className="mascotprofile__list">
              <Row term={t('係', 'Job')}>{t('次の好きを見つけてくる係。', 'Finds your next favorite.')}</Row>
              <Row term={t('生まれ', 'Born')}>
                {t(
                  '新しいクールが始まる日に、Anipairの棚のすき間から芽を出して生まれた。',
                  'Sprouted from a gap on Anipair’s shelf on the day a new season began.',
                )}
              </Row>
              <Row term={t('生態', 'Habits')}>
                {t(
                  '頭の芽は、季節ごとに生え替わる。アニが受信した作品の中から、あなたが好きそうな1本を抱えて持ってくる。「見たい」が増えると、芽が少し元気になる。',
                  'The sprout on its head changes with every season. From the anime Ani has picked up, it brings you one it thinks you’ll like. The more you add to Want to watch, the perkier the sprout gets.',
                )}
              </Row>
              <Row term={t('好きなもの', 'Likes')}>{t('新番組のチェック、あらすじを読むこと、日なたぼっこ。', 'Checking out new shows, reading synopses, basking in the sun.')}</Row>
              <Row term={t('苦手なもの', 'Dislikes')}>{t('「興味なし」を続けて押されること（すぐ立ち直る）。', 'Getting “Not interested” pressed over and over (it bounces back quickly).')}</Row>
              <Row term={t('口ぐせ', 'Catchphrase')}>{t('「これ、好きそう」', '“I think you’d like this.”')}</Row>
              <Row term={t('大きさ', 'Size')}>{t('セル画を横に1枚ぶん。', 'One animation cel wide.')}</Row>
            </dl>
          </div>
        </section>

        <section className="group">
          <h3 className="group__title">{t('ペアの季節の芽', 'Pair’s seasonal sprouts')}</h3>
          <ul className="mascotprofile__seasons">
            {SEASONS.map((s) => (
              <li key={s}>
                <svg className="mascot" viewBox="0 0 120 120" aria-hidden>
                  <PairFigure season={s} />
                </svg>
                <span>{seasonNameLabel(s)}</span>
              </li>
            ))}
          </ul>
          <p className="mascotprofile__note">{t('いま見ているクールの季節の芽が生えます。', 'The sprout matches the season you’re currently viewing.')}</p>
        </section>

        <p className="mascotprofile__foot">
          {t(
            '記録やブラウズの画面で、下からのぞいていたり、散歩していたりします。見つけたら触れてあげてください。喜びます。',
            'You’ll find them peeking up from the bottom of the Records and Browse screens, or out for a stroll. If you spot them, give them a poke. They’ll be thrilled.',
          )}
        </p>
      </article>
    </Sheet>
  )
}
