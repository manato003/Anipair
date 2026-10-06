import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpIcon } from './Icons'
import { Sheet } from './Sheet'
import { Tour } from './Tour'
import { presentSteps, type TourStep } from './tourSteps'

// 各画面の右上の「?」。いつでも、迷ったその場で開ける（docs/concept.md「利用者への姿勢」）。
// 押すと、まず画面の上で示す使い方（Tour）を出し、ボタンを1つずつ明るくして説明する。
// 「文章で詳しく読む」で、文章の使い方（HelpSheet）に切り替える。開いた画面の使い方を一番上に、ほかの画面は畳んで並べる

export type HelpTopic = 'rate' | 'match' | 'records' | 'browse' | 'settings'

// 画面の上で示す手順。target は画面の中の CSS セレクター（今の画面に無いものは飛ばす）
const TOURS: Record<HelpTopic, readonly TourStep[]> = {
  rate: [
    { target: '.stepper', title: 'クールを選ぶ', body: '矢印や年・季節を押すと、さかのぼるクールを変えられます。' },
    { target: '.progress', title: '進み具合', body: 'このクールの人気作のうち、答えた数です。全部に答えると「踏破」です。' },
    { target: ['.rate__stage .card', '.rate__stage .card__cover'], title: '作品', body: '表紙を押すと、あらすじや関連作品などの詳細が開きます。' },
    { target: '.answers__main', title: '見ていない・気になる', body: '見ていなければ「見てない」、気になる作品は「見たい」。いちばんよく押すボタンです。' },
    { target: '.answers__ratings', title: '見た作品を評価する', body: '「良くない」から「とても良い」までの4段階です。見たけれど内容を覚えていなければ「覚えてない」。' },
    { target: '.answers__sub', title: 'そのほか', body: '見ている途中なら「見てる」、途中でやめたなら「視聴中断」。押し間違えたら「ひとつ戻る」で前の作品に戻って答え直せます。' },
  ],
  match: [
    { target: '.rate__stage .filter', title: '条件', body: '提案してほしい作品の形式と放送年を選べます。' },
    { target: '.rate__stage .btn--primary', title: '提案してもらう', body: 'あなたの評価から好みを調べて、まだ記録していない作品を1枚ずつ提案します。' },
    { target: ['.rate__stage .card', '.rate__stage .card__cover'], title: '提案された作品', body: 'おすすめの理由も一緒に出ます。表紙を押すと詳細が開きます。' },
    {
      target: '.answers__unseen--three',
      title: '答える',
      body: '気になれば「見たい」（Annict の見たいリストに入ります）。興味が無ければ「パス」で3ヶ月、今はいいなら「スルー」で1週間、出さなくなります。',
    },
    { target: '.answers__misc', title: 'もう見た作品', body: '「見たことがある」から評価できます。押し間違えたら「ひとつ戻る」で前の作品に戻せます。' },
    { target: '.rate__links', title: '条件を変える', body: '「条件」で形式と放送年を絞り直し、「提案し直す」で新しい候補にできます。' },
  ],
  records: [
    { target: '.viewswitch', title: '記録と実績', body: '記録の一覧と、手に入れた称号が並ぶ「実績」を切り替えます。' },
    { target: '.records__controls .chips', title: '状態で分ける', body: '見た・見たい・見てる・視聴中断で分けて見られます。' },
    { target: '.records__list .row', title: '話ごとの記録', body: '作品を押すと詳細が開きます。見た・見てるの作品は、詳細の「話ごとの記録」で話を4段階で評価して Annict に記録できます。評価を押すと、同じ場所に次の話が出ます。' },
    { target: '.records__filterbtn', title: '絞り込み', body: '評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。' },
    { target: '.records__sort', title: '並べ替え', body: '押している並べ替えをもう一度押すと、新しい順と古い順（高い順と低い順）が入れ替わります。いまの並べ方は下に1行で出ます。' },
    { target: '.records__buttons', title: '傾向・編集', body: '「傾向」で記録の分析を図で、「編集」で一覧のまま状態や評価を変えられます。' },
    { target: '.records__list .row', title: '作品', body: '題名か表紙を押すと、作品の詳細が開きます。' },
  ],
  browse: [
    { target: '.records__controls .search', title: 'タイトルで探す', body: '題名の一部を入れると、Annict の作品から探します。' },
    { target: '.records__controls .stepper', title: 'クールを選ぶ', body: 'クールごとの作品の一覧を見られます。' },
    {
      target: '.records__controls .records__filterbtn',
      title: '絞り込み',
      body: '放送年と季節を選ぶと、何年分でもまとめて見られます（クールの代わり）。自分の記録（未記録・見たなど）・形式・ジャンル・制作会社でも絞り込めます。',
    },
    {
      target: '.records__controls .toggle',
      title: '並べ替え',
      body: '人気順は Annict で記録した人の多い順、評価順は評判の高い順（Annict の満足度、無ければ Shikimori の点数）、おすすめ順はあなたの評価から好みに合いそうな順です。',
    },
    { target: '.records__list .row', title: '作品', body: '押すと詳細が開きます。状態と評価を付けられ、関連作品や、声優・スタッフの参加作品もその場で開けます。' },
  ],
  settings: [
    { target: '#settings-account', title: 'Annict 連携', body: 'ログインとログアウトです。記録はすべて、あなたの Annict に保存されます。Annict の調子（緑は正常、黄は混み合い、赤は応答なし）もここで見られます。' },
    { target: '#settings-github', title: 'GitHub 連携（任意）', body: '連携すると、パス・スルー・見てないを PC とスマホで共有でき、毎日自動でバックアップされます。' },
    { target: '#settings-backup', title: 'バックアップ', body: '連携しなくても、すべての記録をファイルに書き出せます。' },
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
      ['気にならない作品', '興味が無ければ「パス」（3ヶ月は出ません）、今はいいなら「スルー」（1週間後にまた出ます）。'],
      ['見たことがある作品', '「見たことがある」から評価できます。'],
      ['条件', '形式（TV・劇場版など）と放送年で絞れます。好きな作品を評価するほど、提案が好みに寄っていきます。'],
    ],
  },
  {
    id: 'records',
    title: '記録',
    items: [
      ['一覧', 'Annict の記録を、見た・見たい・見てる・視聴中断に分けて並べます。題名か表紙を押すと、作品の詳細を開きます。'],
      ['話ごとの記録', '「見た」「見てる」の作品を押して詳細を開くと、「話ごとの記録」で話を4段階で評価して Annict に記録できます。評価を押すと、同じ場所に次の話が出るので、続けて押せます。‹ › か、下に並ぶ話の一覧から、ほかの話も選べます。見てる作品は最終話まで記録すると、作品の評価を付けて「見た」にできます。記録欄の右下の「感想を書く」で、その話の感想も残せます。書いてから評価を押せば一緒に記録し、評価したあとに押せばその記録に付けます（書かなくても記録はできています）。'],
      ['絞り込み', '評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。'],
      ['並べ替え', '評価順・記録順・放送日順など。押している並べ替えをもう一度押すと、向きが逆になります。'],
      ['編集', '一覧のまま、状態や評価を変えられます。'],
      ['傾向', '見た本数・完走率・評価の分布と世間との甘口辛口・ジャンルの好み・黄金期・隠れた名作・よく見る声優や監督などを、図で見られます。'],
      ['実績', '答えた数やクールの踏破で手に入る称号を見られます。手に入れた称号を押すと、プロフィールに掲げられます。'],
    ],
  },
  {
    id: 'browse',
    title: 'ブラウズ',
    items: [
      ['探す', 'クールごとの作品の一覧と、タイトルでの検索です。人気順・評価順・おすすめ順などで並べ替えられます。'],
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
      ['GitHub 連携（任意）', 'パス・スルー・見てないを PC とスマホで共有でき、毎日自動でバックアップされます。連携しなくても、記録をファイルに書き出せます。'],
      ['演出・キー', '演出の強さ（ふつう・控えめ・なし）と、PC のキーの割り当てを変えられます。'],
    ],
  },
]

const COMMON: readonly Item[] = [
  ['シートを閉じる', 'スマホではシートの中のどこかをタップすると閉じます（ボタンやリンクは除きます）。PC では Esc か、シートの外側を押します。'],
  ['キーボード', 'PC ではキーボードだけでも答えられます。キーはボタンの横に出ていて、設定で変えられます。'],
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
