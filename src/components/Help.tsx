import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpIcon } from './Icons'
import { Sheet } from './Sheet'
import { Tour } from './Tour'
import { presentSteps, type TourStep } from './tourSteps'

// 各画面の右上の「?」。いつでも、迷ったその場で開ける。
// 押すと、まず画面の上で示す使い方（Tour）を出し、ボタンを1つずつ明るくして説明する。
// 「文章で詳しく読む」で、文章の使い方（HelpSheet）に切り替える。開いた画面の使い方を一番上に、ほかの画面は畳んで並べる

export type HelpTopic = 'rate' | 'match' | 'records' | 'browse' | 'settings'

// 画面の上で示す手順。target は画面の中の CSS セレクター（今の画面に無いものは飛ばす）
const TOURS: Record<HelpTopic, readonly TourStep[]> = {
  rate: [
    { target: '.stepper', title: 'クールを選ぶ', body: '矢印や年・季節を押すと、さかのぼるクールを変えられます。' },
    { target: '.progress', title: '進み具合', body: 'このクールの人気作のうち、答えた数です。全部に答えると「踏破」です。' },
    { target: '.app__screen:not([hidden]) .bell', title: 'コントロールセンター', body: '保存できなかった記録などの知らせが出ます。テーマの色・明るさ・画面の動きなども、ここでその場で変えられます。' },
    { target: '.app__screen:not([hidden]) .flow__art', title: '作品', body: '表紙を押すと、あらすじや関連作品などの詳細が開きます。' },
    { target: '.app__screen:not([hidden]) .flow__row--prev', title: '直前の答え', body: '答えた作品は、答えの印を付けて上に残ります。押し間違えたら「ひとつ戻る」で戻せます。' },
    { target: '.answers__main', title: '見ていない・気になる', body: '見ていなければ「見てない」、気になる作品は「見たい」。いちばんよく押すボタンです。' },
    { target: '.answers__ratings', title: '見た作品を評価する', body: '「良くない」から「とても良い」までの4段階です。見たけれど内容を覚えていなければ「覚えてない」。' },
    { target: '.answers__sub', title: 'そのほか', body: '見ている途中なら「見てる」、途中でやめたなら「視聴中断」。押し間違えたら左端の「ひとつ戻る」で前の作品に戻って答え直せます。右端の「詳しく」で詳細が開きます。' },
    { target: '.tabs', title: '画面を替える', body: '評価・マッチング・記録・ブラウズ・設定を切り替えます。スマホでは、画面を左右に払っても替わります。' },
  ],
  match: [
    { target: '.flow__placeholder .filter', title: '条件', body: '提案してほしい作品の形式と放送年を選べます。' },
    { target: '.flow__placeholder .btn--primary', title: '提案してもらう', body: 'あなたの評価から好みを調べて、まだ記録していない作品を1枚ずつ提案します。' },
    { target: '.app__screen:not([hidden]) .flow__art', title: '提案された作品', body: 'おすすめの理由も一緒に出ます。表紙を押すと詳細が開きます。' },
    {
      target: '.answers__main--three',
      title: '答える',
      body: '気になれば「見たい」（Annict の見たいリストに入ります）。興味が無ければ「興味なし」で3ヶ月、今は決めないなら「保留」で1週間、出さなくなります。',
    },
    { target: '.answers__sub', title: 'もう見た作品', body: '「見たことがある」から評価できます。押し間違えたら左端の「ひとつ戻る」で前の作品に戻せます。両端のボタンは評価の画面と同じ位置です。' },
    { target: '.rate__links', title: '条件を変える', body: '「条件」で形式と放送年を絞り直し、「提案し直す」で新しい候補にできます。' },
  ],
  records: [
    { target: '.app__screen:not([hidden]) .rtabs, .app__screen:not([hidden]) .rrail', title: '記録の項目', body: '見てる・見た・見たい・視聴中断で分けて見られます。傾向・ふり返り・実績はスマホでは「まとめ」の中にあります。スマホでは左右に払っても替わります。' },
    { target: '.app__screen:not([hidden]) .watchcard, .app__screen:not([hidden]) .shelf__item', title: '作品', body: '表紙か題名を押すと詳細が開きます。見てるの作品は、次の話をその場で記録できます。見た・見てるの作品は、詳細の「話ごとの記録」で話を4段階で評価して記録できます。' },
    { target: '.app__screen:not([hidden]) .records__filterbtn', title: '絞り込み', body: '評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。' },
    { target: '.app__screen:not([hidden]) .rsort', title: '並べ替え', body: '押している並べ替えをもう一度押すと、新しい順と古い順（高い順と低い順）が入れ替わります。いまの並べ方は下に1行で出ます。' },
    { target: '.app__screen:not([hidden]) .rhead__edit', title: '編集', body: '一覧のまま、状態や評価を変えたり、見たいにメモを付けたりできます。' },
  ],
  browse: [
    { target: '.app__screen:not([hidden]) .records--browse .search', title: 'タイトルで探す', body: '題名の一部を入れると、Annict の作品から探します。' },
    { target: '.app__screen:not([hidden]) .records--browse .stepper', title: 'クールを選ぶ', body: 'クールごとの作品の一覧を見られます。' },
    {
      target: '.app__screen:not([hidden]) .records--browse .records__filterbtn',
      title: '絞り込み',
      body: '放送年と季節を選ぶと、何年分でもまとめて見られます（クールの代わり）。自分の記録（未記録・見たなど）・形式・ジャンル・制作会社でも絞り込めます。',
    },
    {
      target: '.app__screen:not([hidden]) .records--browse .rsort',
      title: '並べ替え',
      body: '人気順は Annict で記録した人の多い順、評価順はほかの人の評価が高い順（評価した人の少ない作品は、点数を平均に寄せて並べます）、おすすめ順はあなたの評価から好みに合いそうな順です。',
    },
    { target: '.app__screen:not([hidden]) .records--browse .shelf__item', title: '作品', body: '押すと詳細が開きます。表紙の隅に、自分の評価や状態が出ます。詳細では状態と評価を付けられ、関連作品や、声優・スタッフの参加作品もその場で開けます。' },
  ],
  settings: [
    { target: '.settings--groups .folders, .settings--groups .rrail', title: '設定の項目', body: 'アカウント・表示・バックアップなどに分けています。押すと、その中の設定が開きます。' },
    { target: '#settings-theme', title: '表示', body: 'テーマの色・明るさ・時刻で色を変えるか・片手操作（よく押すボタンを左右どちらに寄せるか）・画面の動きを選べます。' },
    { target: '#settings-account', title: 'Annict 連携', body: 'ログインとログアウトです。記録はすべて、あなたの Annict に保存されます。Annict の調子（緑は正常、黄は混み合い、赤は応答なし）もここで見られます。' },
    { target: '#settings-github', title: 'GitHub 連携（任意）', body: '連携すると、興味なし・保留・見てないを PC とスマホで共有でき、毎日自動でバックアップされます。' },
    { target: '#settings-backup', title: 'バックアップ', body: '連携しなくても、すべての記録をファイルに書き出せます。' },
    { target: '#settings-buttons', title: 'ボタンの表示', body: '評価とマッチングのボタンを、アイコンと名前・アイコンだけ・名前だけから選べます。' },
    { target: '#settings-effects', title: '演出', body: '10件ごとや踏破の演出の強さを選べます。' },
  ],
}

// 1項目 = [短い見出し, 説明]。見出しだけを拾い読みしても、探している操作が見つかるように
type Item = readonly [string, string]

const TOPICS: readonly { id: HelpTopic; title: string; items: readonly Item[] }[] = [
  {
    id: 'rate',
    title: '評価',
    items: [
      ['答える', '放送の終わった「見てる」作品と、クールをさかのぼった作品が1枚ずつ出てきます。下のボタンで答えると、次の作品に進みます。'],
      ['見た作品', '「良くない」から「とても良い」までの4段階で評価します。見たけれど内容を覚えていなければ「覚えてない」です。'],
      ['見ていない作品', '見ていなければ「見てない」、気になる作品は「見たい」です。'],
      ['見ている途中・やめた', '見ている途中なら「見てる」、途中でやめたなら「視聴中断」です。放送中のクールの「見てる」作品は出しません。「まだ見てる」と答えた作品は、そのクールのあいだは聞き直しません。'],
      ['間違えたとき', '「ひとつ戻る」で前の作品に戻り、答えを取り消せます。'],
      ['作品をよく知りたい', '「詳しく」を押すと、あらすじや関連作品を読めます。'],
      ['上の線', 'そのクールの人気作のうち、答えた数です。矢印や年・季節を選ぶと、ほかのクールに移れます。'],
    ],
  },
  {
    id: 'match',
    title: 'マッチング',
    items: [
      ['提案してもらう', 'あなたの評価から好みを調べて、まだ記録していない作品を1枚ずつ提案します。'],
      ['気になる作品', '「見たい」を押すと、Annict の見たいリストに入ります。'],
      ['気にならない作品', '興味が無ければ「興味なし」（3ヶ月は出ません）、今は決めないなら「保留」（1週間後にまた出ます）。'],
      ['見たことがある作品', '「見たことがある」から評価できます。'],
      ['条件', '形式（TV・劇場版など）と放送年で絞れます。好きな作品を評価するほど、提案が好みに寄っていきます。'],
    ],
  },
  {
    id: 'records',
    title: '記録',
    items: [
      ['一覧', 'Annict の記録を、見てる・見た・見たい・視聴中断に分けて並べます。表紙か題名を押すと、作品の詳細を開きます。'],
      ['見てる作品', 'カードに次の話と残りの話数が出ます。カードの4段階の評価を押すと、その話をその場で記録できます。'],
      ['クールで絞る', '一覧の上の「すべて・前期・今期・来期」と矢印・年・季節で、そのクールの作品だけにできます。'],
      ['見たいの優先とメモ', '表紙の右上の☆で「優先して見る」の印を付けられます。メモは作品の詳細から書けます。'],
      ['話ごとの記録', '「見た」「見てる」の作品を押して詳細を開くと、「話ごとの記録」で話を4段階で評価して Annict に記録できます。評価を押すと、同じ場所に次の話が出るので、続けて押せます。‹ › か、下に並ぶ話の一覧から、ほかの話も選べます。見てる作品は最終話まで記録すると、作品の評価を付けて「見た」にできます。記録欄の右下の「感想を書く」で、その話の感想も残せます。書いてから評価を押せば一緒に記録し、評価したあとに押せばその記録に付けます（書かなくても記録はできています）。'],
      ['絞り込み', '評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。'],
      ['並べ替え', '好きな順（あなたの評価の高い順。見たの一覧だけ）・人気順・記録順・放送日順。押している並べ替えをもう一度押すと、向きが逆になります。'],
      ['編集', '一覧のまま、状態や評価を変えられます。'],
      ['まとめ', '傾向・年間ふり返り・実績です。スマホでは上の「まとめ」から、PC では左の列から開きます。'],
      ['傾向', '見た本数・完走率・評価の分布と世間との甘口辛口・ジャンルの好み・黄金期・隠れた名作・よく見る声優や監督などを、図で見られます。'],
      ['実績', '答えた数やクールの踏破で手に入る称号を見られます。手に入れた称号を押すと、プロフィールに掲げられます。'],
    ],
  },
  {
    id: 'browse',
    title: 'ブラウズ',
    items: [
      ['探す', 'クールごとの作品の一覧と、タイトルでの検索です。「前期・今期・来期」ですぐに移れます。'],
      ['並べ替え', '人気順（見た人の多い順）・評価順（ほかの人の評価が高い順）・おすすめ順（あなたの好みに合いそうな順）・放送日順。押している並べ替えをもう一度押すと、向きが逆になります。'],
      ['絞り込み', '放送年（から〜まで）と季節を選ぶと、クールの代わりにその期間の作品を見られます。タイトルで検索しているときも使えます。自分の記録（未記録・見たなど）・形式・ジャンル・制作会社でも絞り込めます。'],
      ['詳細', '作品を押すと開きます。状態と評価を付けられ、あらすじ・キャスト・スタッフ・関連作品も読めます。'],
      ['関連作品', '題名を押すと、その作品の詳細を重ねて開きます。そこでも、そのまま記録できます。'],
      ['声優・スタッフ・制作会社', '詳細のキャストやスタッフの名前を押すと、その人や制作会社が参加した作品が並びます。'],
    ],
  },
  {
    id: 'settings',
    title: '設定',
    items: [
      ['Annict 連携', 'ログインとログアウトです。記録はすべて、あなたの Annict に保存されます。'],
      ['GitHub 連携（任意）', '興味なし・保留・見てないを PC とスマホで共有でき、毎日自動でバックアップされます。連携しなくても、記録をファイルに書き出せます。'],
      ['表示', 'テーマの色・明るさ・時刻で色を変えるか・片手操作・画面の動きを選べます。'],
      ['ボタン・演出・キー', '評価とマッチングのボタンの表示（アイコンと名前・アイコンだけ・名前だけ）、演出の強さ（ふつう・控えめ・なし）、PC のキーの割り当てを変えられます。'],
    ],
  },
]

const COMMON: readonly Item[] = [
  ['画面を替える', 'スマホは下、PC は上の帯で替えます。スマホでは画面を左右に払っても、PC では ← → でも替わります。'],
  ['コントロールセンター', '各画面の右上のボタンです。保存できなかった記録などの知らせと、テーマの色・明るさ・画面の動きなどのクイック設定があります。'],
  ['閉じる', '右上の ✕ で閉じます（スマホで片手操作を左手にしていれば左上）。スマホでは下へ払っても閉じます。作品の詳細は右へ払っても、下から出る小さな画面は空いている所をタップしても閉じます。PC では Esc でも閉じます。'],
  ['いちばん上へ', '長い一覧では、下の隅に出るボタンか、いまの画面の帯をもう一度押すと先頭に戻ります。'],
  ['キーボード', 'PC ではキーボードだけでも答えられます。キーはボタンの横に出ていて、設定で変えられます。← → で画面を切り替えられます。'],
]

export function HelpSheet(props: { topic: HelpTopic; active?: boolean; onClose: () => void }) {
  const current = TOPICS.find((t) => t.id === props.topic) ?? TOPICS[0]
  const others = TOPICS.filter((t) => t.id !== current.id)
  return (
    <Sheet label="使い方" active={props.active} onClose={props.onClose}>
      <h2 className="detail__title">使い方</h2>
      <section className="help__section">
        <h3 className="help__heading">この画面（{current.title}）</h3>
        <HelpList items={current.items} />
      </section>
      <section className="help__section">
        <h3 className="help__heading">どの画面でも</h3>
        <HelpList items={COMMON} />
      </section>
      <section className="help__section">
        <h3 className="help__heading">ほかの画面</h3>
        {others.map((t) => (
          <details key={t.id} className="help__more">
            <summary>{t.title}</summary>
            <HelpList items={t.items} />
          </details>
        ))}
      </section>
      <p className="help__thanks">Anipair を使っていただき、ありがとうございます。迷ったときは、いつでも右上の「?」を押してください。</p>
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

// 画面の見出しの右端に置く「?」。onOpenChange は、開いているあいだ画面のキー操作を止めるため（評価・マッチング）。
// 案内もシートも画面の一番外（body）に出す。画面の中の重なりの順（z-index）に隠されないように
type Mode = { kind: 'tour'; steps: ReturnType<typeof presentSteps> } | { kind: 'text' } | null

export function HelpButton(props: { topic: HelpTopic; active?: boolean; onOpenChange?: (open: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<Mode>(null)
  const change = (next: Mode) => {
    setMode(next)
    props.onOpenChange?.(next !== null)
  }
  const open = () => {
    const root = ref.current?.closest('.app__screen, main') ?? document
    const steps = presentSteps(root, TOURS[props.topic])
    // 示せるボタンが1つも無いとき（読み込み中など）は、文章の使い方を出す
    change(steps.length > 0 ? { kind: 'tour', steps } : { kind: 'text' })
  }
  return (
    <>
      <button ref={ref} type="button" className="helpbtn" aria-label="使い方" title="使い方" onClick={open}>
        <HelpIcon />
      </button>
      {mode?.kind === 'tour' && <Tour label="使い方" steps={mode.steps} onClose={() => change(null)} onText={() => change({ kind: 'text' })} />}
      {mode?.kind === 'text' && createPortal(<HelpSheet topic={props.topic} active={props.active} onClose={() => change(null)} />, document.body)}
    </>
  )
}
