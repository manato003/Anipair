import { AniFigure, PairFigure } from '../../components/Mascot'
import { Sheet } from '../../components/Sheet'
import { seasonNameLabel, type SeasonName } from '../../lib/season'

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
    <Sheet label="アニとペアのこと" size="page" onClose={props.onClose}>
      <article className="mascotprofile">
        <h2 className="mascotprofile__title">アニとペアのこと</h2>
        <p className="mascotprofile__lead">Anipair の名前を2つに割ると、アニとペア。アニが見て、ペアが見つける。2人でひとつの Anipair です。</p>

        <section className="group mascotprofile__card">
          <svg className="mascot mascotprofile__figure" viewBox="0 0 120 120" aria-hidden>
            <AniFigure expr="happy" />
          </svg>
          <div>
            <h3 className="group__title">アニ</h3>
            <dl className="mascotprofile__list">
              <Row term="係">アニメを見る係。</Row>
              <Row term="生まれ">深夜アニメの放送が終わったあと、テレビの砂嵐の向こうからやってきた。頭のアンテナは、そのときから付いている。</Row>
              <Row term="生態">夜になると元気になる（深夜は眠そうな顔で出てくるが、本人は起きているつもり）。アンテナで今期の作品を受信する。気持ちはアンテナに出て、受信中は揺れ、困ると曲がる。</Row>
              <Row term="好きなもの">深夜アニメ、新番組の第1話、最終回の余韻、こたつ。</Row>
              <Row term="苦手なもの">ネタバレ、録り逃し。</Row>
              <Row term="口ぐせ">「受信中…」</Row>
              <Row term="大きさ">セル画を縦に1枚ぶん。</Row>
            </dl>
          </div>
        </section>

        <section className="group mascotprofile__card">
          <svg className="mascot mascotprofile__figure" viewBox="0 0 120 120" aria-hidden>
            <PairFigure expr="happy" />
          </svg>
          <div>
            <h3 className="group__title">ペア</h3>
            <dl className="mascotprofile__list">
              <Row term="係">次の好きを見つけてくる係。</Row>
              <Row term="生まれ">新しいクールが始まる日に、Anipair の棚のすき間から芽を出して生まれた。</Row>
              <Row term="生態">頭の芽は、季節ごとに生え替わる。アニが受信した作品の中から、あなたが好きそうな1本を抱えて持ってくる。「見たい」が増えると、芽が少し元気になる。</Row>
              <Row term="好きなもの">新番組のチェック、あらすじを読むこと、日なたぼっこ。</Row>
              <Row term="苦手なもの">「興味なし」を続けて押されること（すぐ立ち直る）。</Row>
              <Row term="口ぐせ">「これ、好きそう」</Row>
              <Row term="大きさ">セル画を横に1枚ぶん。</Row>
            </dl>
          </div>
        </section>

        <section className="group">
          <h3 className="group__title">ペアの季節の芽</h3>
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
          <p className="mascotprofile__note">いま見ているクールの季節の芽が生えます。</p>
        </section>

        <p className="mascotprofile__foot">記録やブラウズの画面で、下からのぞいていたり、散歩していたりします。見つけたら触れてあげてください。喜びます。</p>
      </article>
    </Sheet>
  )
}
