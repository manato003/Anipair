import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FAQ } from './faq'
import { FeedbackSheet } from './FeedbackSheet'
import { t } from '../lib/i18n'
import { HelpIcon } from './Icons'
import { Sheet } from './Sheet'
import { Tour } from './Tour'
import { presentSteps, type TourStep } from './tourSteps'

// 各画面の右上の「?」。いつでも、迷ったその場で開ける。
// 押すと、まず画面の上で示す使い方（Tour）を出し、ボタンを1つずつ明るくして説明する。
// 「文章で詳しく読む」で、文章の使い方（HelpSheet）に切り替える。開いた画面の使い方を一番上に、ほかの画面は畳んで並べる

export type HelpTopic = 'rate' | 'match' | 'records' | 'browse' | 'settings'

// 画面の上で示す手順。target は画面の中の CSS セレクター（今の画面に無いものは飛ばす）
// 言語を替えたら文言も替わるように、呼ぶたびに作る（ファイルの一番外で t() を呼ばない）
function tours(topic: HelpTopic): readonly TourStep[] {
  switch (topic) {
    case 'rate':
      return [
        { target: '.stepper', title: t('クールを選ぶ', 'Choose a season'), body: t('矢印や年・季節を押すと、さかのぼるクールを変えられます。', 'Use the arrows, or pick a year and season, to change which season you look back on.') },
        { target: '.progress', title: t('進み具合', 'Progress'), body: t('このクールの人気作のうち、答えた数です。全部に答えると「踏破」です。', 'How many of this season’s popular anime you’ve answered. Answer them all to complete the season.') },
        {
          target: '.app__screen:not([hidden]) .bell',
          title: t('コントロールセンター', 'Control center'),
          body: t('保存できなかった記録などの知らせが出ます。テーマの色・明るさ・画面の動きなども、ここでその場で変えられます。', 'Shows notifications, such as records that couldn’t be saved. You can also change the theme color, brightness, and motion right here.'),
        },
        { target: '.app__screen:not([hidden]) .flow__art', title: t('作品', 'Anime'), body: t('表紙を押すと、あらすじや関連作品などの詳細が開きます。', 'Tap the cover to open details such as the synopsis and related anime.') },
        {
          target: '.app__screen:not([hidden]) .flow__row--prev',
          title: t('直前の答え', 'Your last answer'),
          body: t('答えた作品は、答えの印を付けて上に残ります。押し間違えたら「ひとつ戻る」で戻せます。', 'Anime you’ve answered stay above with a mark showing your answer. If you tapped the wrong button, use “Undo” to go back.'),
        },
        {
          target: '.answers__main',
          title: t('見ていない・気になる', 'Not seen or interested'),
          body: t('見ていなければ「見てない」、気になる作品は「見たい」。いちばんよく押すボタンです。', 'If you haven’t seen it, tap “Haven’t seen”. If it looks interesting, tap “Want to watch”. These are the buttons you’ll use most.'),
        },
        {
          target: '.answers__ratings',
          title: t('見た作品を評価する', 'Rate what you’ve watched'),
          body: t('「良くない」から「とても良い」までの4段階です。見たけれど内容を覚えていなければ「覚えてない」。', 'Rate it from “Bad” to “Great” in four steps. If you watched it but don’t remember it, tap “Don’t remember”.'),
        },
        {
          target: '.answers__sub',
          title: t('そのほか', 'More buttons'),
          body: t(
            '見ている途中なら「見てる」、途中でやめたなら「視聴中断」。押し間違えたら左端の「ひとつ戻る」で前の作品に戻って答え直せます。右端の「詳しく」で詳細が開きます。',
            'Tap “Watching” if you’re partway through, or “Dropped” if you stopped. If you tapped the wrong button, “Undo” on the far left returns to the previous anime so you can answer again. “Details” on the far right opens the details.',
          ),
        },
        { target: '.tabs', title: t('画面を替える', 'Switch screens'), body: t('評価・マッチング・記録・ブラウズ・設定を切り替えます。スマホでは、画面を左右に払っても替わります。', 'Switch between Rate, Match, Records, Browse, and Settings. On a phone, you can also swipe left or right.') },
      ]
    case 'match':
      return [
        { target: '.flow__placeholder .filter', title: t('条件', 'Filters'), body: t('提案してほしい作品の形式と放送年を選べます。', 'Choose the format and air year of the anime you want suggested.') },
        {
          target: '.flow__placeholder .btn--primary',
          title: t('提案してもらう', 'Get suggestions'),
          body: t('あなたの評価から好みを調べて、まだ記録していない作品を1枚ずつ提案します。', 'Anipair learns your taste from your ratings and suggests anime you haven’t recorded yet, one at a time.'),
        },
        { target: '.app__screen:not([hidden]) .flow__art', title: t('提案された作品', 'A suggested anime'), body: t('おすすめの理由も一緒に出ます。表紙を押すと詳細が開きます。', 'The reason it was suggested is shown too. Tap the cover to open details.') },
        {
          target: '.answers__main--three',
          title: t('答える', 'Answer'),
          body: t(
            '気になれば「見たい」（Annictの見たいリストに入ります）。興味が無ければ「興味なし」で3ヶ月、今は決めないなら「保留」で1週間、出さなくなります。',
            'If it looks interesting, tap “Want to watch” (it goes on your Annict Want to watch list). Tap “Not interested” to stop seeing it for 3 months, or “Later” to hide it for 1 week.',
          ),
        },
        {
          target: '.answers__sub',
          title: t('もう見た作品', 'Already seen it'),
          body: t(
            '「見たことがある」から評価できます。押し間違えたら左端の「ひとつ戻る」で前の作品に戻せます。両端のボタンは評価の画面と同じ位置です。',
            'Tap “Seen it” to rate it. If you tapped the wrong button, “Undo” on the far left returns to the previous anime. The buttons at both ends are in the same place as on the Rate screen.',
          ),
        },
        { target: '.rate__links', title: t('条件を変える', 'Change filters'), body: t('「条件」で形式と放送年を絞り直し、「提案し直す」で新しい候補にできます。', 'Use “Filters” to narrow by format and air year again, then “Refresh” to get new suggestions.') },
      ]
    case 'records':
      return [
        {
          target: '.app__screen:not([hidden]) .rtabs, .app__screen:not([hidden]) .rrail',
          title: t('記録の項目', 'Record sections'),
          body: t(
            '見てる・見た・見たい・視聴中断で分けて見られます。傾向・ふり返り・実績はスマホでは「まとめ」の中にあります。スマホでは左右に払っても替わります。',
            'View your records split into Watching, Watched, Want to watch, and Dropped. On a phone, Trends, Year in review, and Achievements are under “Summary”. You can also swipe left or right to switch.',
          ),
        },
        {
          target: '.app__screen:not([hidden]) .watchcard, .app__screen:not([hidden]) .shelf__item',
          title: t('作品', 'Anime'),
          body: t(
            '表紙か題名を押すと詳細が開きます。見てるの作品は、次の話をその場で記録できます。一覧の上で見るサービスを選ぶと、放送中の作品に次の放送日が出ます。「今週の放送」で、これから7日の放送を日ごとに見られます。見た・見てるの作品は、詳細の「話ごとの記録」で話を4段階で評価して記録できます。',
            'Tap a cover or title to open details. For anime you’re watching, you can record the next episode right there. Pick where you watch above the list to see the next air date on airing anime, and use “This week” to see the next 7 days of broadcasts by day. For Watched and Watching anime, rate episodes in four steps under “Episode records” in the details.',
          ),
        },
        {
          target: '.app__screen:not([hidden]) .records__filterbtn',
          title: t('絞り込み', 'Filter'),
          body: t('評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。', 'Filter by rating, air year, season, format, genre, or studio. Active filters show above the list; tap one to remove it.'),
        },
        {
          target: '.app__screen:not([hidden]) .rsort',
          title: t('並べ替え', 'Sort'),
          body: t(
            '押している並べ替えをもう一度押すと、新しい順と古い順（高い順と低い順）が入れ替わります。いまの並べ方は下に1行で出ます。',
            'Tap the current sort again to flip between newest and oldest (or highest and lowest). The current order is shown in one line below.',
          ),
        },
        { target: '.app__screen:not([hidden]) .rhead__edit', title: t('編集', 'Edit'), body: t('一覧のまま、状態や評価を変えたり、見たいにメモを付けたりできます。', 'Change status or ratings, or add notes to Want to watch anime, without leaving the list.') },
      ]
    case 'browse':
      return [
        { target: '.app__screen:not([hidden]) .records--browse .search', title: t('タイトルで探す', 'Search by Japanese title'), body: t('題名の一部を入れると、Annictの作品から探します。', 'Type part of the Japanese title to search Annict’s anime. Annict’s search doesn’t match romanized or English titles.') },
        { target: '.app__screen:not([hidden]) .records--browse .stepper', title: t('クールを選ぶ', 'Choose a season'), body: t('クールごとの作品の一覧を見られます。', 'See the list of anime for each season.') },
        {
          target: '.app__screen:not([hidden]) .records--browse .records__filterbtn',
          title: t('絞り込み', 'Filter'),
          body: t(
            '放送年と季節を選ぶと、何年分でもまとめて見られます（クールの代わり）。自分の記録（未記録・見たなど）・形式・ジャンル・制作会社でも絞り込めます。',
            'Pick air years and seasons to browse any span of years at once (instead of a single season). You can also filter by your own records (Not recorded, Watched, and so on), format, genre, or studio.',
          ),
        },
        {
          target: '.app__screen:not([hidden]) .records--browse .rsort',
          title: t('並べ替え', 'Sort'),
          body: t(
            '人気順はAnnictで記録した人の多い順、評価順はほかの人の評価が高い順（評価した人の少ない作品は、点数を平均に寄せて並べます）、おすすめ順はあなたの評価から好みに合いそうな順です。',
            'Popular sorts by how many people recorded it on Annict. Rating sorts by others’ ratings (anime with few ratings are pulled toward the average). Suggested sorts by what’s likely to match your taste, based on your ratings.',
          ),
        },
        {
          target: '.app__screen:not([hidden]) .records--browse .shelf__item',
          title: t('作品', 'Anime'),
          body: t(
            '押すと詳細が開きます。表紙の隅に、自分の評価や状態が出ます。詳細では状態と評価を付けられ、関連作品や、声優・スタッフの参加作品もその場で開けます。',
            'Tap to open details. Your rating or status shows in the corner of the cover. In the details you can set a status and rating, and open related anime or other anime by the cast and staff right there.',
          ),
        },
      ]
    case 'settings':
      return [
        { target: '.settings--groups .folders, .settings--groups .rrail', title: t('設定の項目', 'Settings sections'), body: t('アカウント・表示・バックアップなどに分けています。押すと、その中の設定が開きます。', 'Settings are grouped into Account, Display, Backup, and more. Tap one to open its settings.') },
        {
          target: '#settings-theme',
          title: t('表示', 'Display'),
          body: t(
            'テーマの色・明るさ・時刻で色を変えるか・片手操作（よく押すボタンを左右どちらに寄せるか）・画面の動きを選べます。',
            'Choose the theme color, brightness, whether colors change with the time of day, one-handed mode (which side the frequently used buttons sit on), and motion.',
          ),
        },
        {
          target: '#settings-account',
          title: t('Annict連携', 'Annict connection'),
          body: t(
            'ログインとログアウトです。記録はすべて、あなたのAnnictに保存されます。Annictへの接続の状態（緑はふつう、黄は時間がかかっている、赤は応答を受け取れていない）もここで見られます。',
            'Log in and log out here. All your records are saved to your Annict account. You can also check the connection to Annict (green is normal, yellow is slow, red means no response).',
          ),
        },
        {
          target: '#settings-github',
          title: t('GitHub連携（任意）', 'GitHub sync (optional)'),
          body: t(
            '連携すると、興味なし・保留・見てない・見たいの印とメモ・見るサービスをPCとスマホで共有でき、毎日自動でバックアップされます。',
            'Once connected, your Not interested, Later, and Haven’t seen marks, Want to watch notes, and Where I watch choices are shared between your computer and phone, and backed up automatically every day.',
          ),
        },
        { target: '#settings-backup', title: t('バックアップ', 'Backup'), body: t('連携しなくても、作品ごとの記録をファイルに書き出せます。', 'Even without connecting, you can export your records per anime to a file.') },
        {
          target: '#settings-buttons',
          title: t('答えのボタン', 'Answer buttons'),
          body: t('評価とマッチングの答えのボタンを、アイコンと名前・アイコンだけ・名前だけから選べます。', 'Choose how the answer buttons on Rate and Match look: icon and name, icon only, or name only.'),
        },
        { target: '#settings-effects', title: t('演出', 'Effects'), body: t('10件ごとや踏破の演出の強さを選べます。', 'Choose how strong the effects are for every 10 answers and for completing a season.') },
        {
          target: '#settings-broadcast',
          title: t('見るサービス', 'Where I watch'),
          body: t(
            '配信サービス・地上波の地域・BS・CSを選ぶと、記録の「見てる」の作品に次の放送日が出ます。',
            'Pick your streaming services, broadcast TV region, and BS/CS, and the next air date appears on anime under Watching in Records.',
          ),
        },
      ]
  }
}

// 1項目 = [短い見出し, 説明]。見出しだけを拾い読みしても、探している操作が見つかるように
type Item = readonly [string, string]

// 言語を替えたら文言も替わるように、呼ぶたびに作る
function topics(): readonly { id: HelpTopic; title: string; items: readonly Item[] }[] {
  return [
    {
      id: 'rate',
      title: t('評価', 'Rate'),
      items: [
        [
          t('答える', 'Answering'),
          t(
            '放送の終わった「見てる」作品と、クールをさかのぼった作品が1枚ずつ出てきます。下のボタンで答えると、次の作品に進みます。',
            'Anime you’re watching that have finished airing, plus anime from earlier seasons, appear one at a time. Answer with the buttons below to move to the next one.',
          ),
        ],
        [
          t('見た作品', 'Anime you’ve watched'),
          t(
            '「良くない」から「とても良い」までの4段階で評価します。見たけれど内容を覚えていなければ「覚えてない」です。',
            'Rate it in four steps, from “Bad” to “Great”. If you watched it but don’t remember it, tap “Don’t remember”.',
          ),
        ],
        [t('見ていない作品', 'Anime you haven’t watched'), t('見ていなければ「見てない」、気になる作品は「見たい」です。', 'Tap “Haven’t seen” if you haven’t watched it, or “Want to watch” if it looks interesting.')],
        [
          t('見ている途中・やめた', 'Partway through, or dropped'),
          t(
            '見ている途中なら「見てる」、途中でやめたなら「視聴中断」です。放送中のクールの「見てる」作品は出しません。「まだ見てる」と答えた作品は、そのクールのあいだは聞き直しません。',
            'Tap “Watching” if you’re partway through, or “Dropped” if you stopped. Anime you’re watching from the season currently airing aren’t shown. Anime you answered “Still watching” won’t be asked again for the rest of that season.',
          ),
        ],
        [t('間違えたとき', 'If you make a mistake'), t('「ひとつ戻る」で前の作品に戻り、答えを取り消せます。', 'Tap “Undo” to return to the previous anime and take back your answer.')],
        [t('作品をよく知りたい', 'Learning more about an anime'), t('「詳しく」を押すと、あらすじや関連作品を読めます。', 'Tap “Details” to read the synopsis and see related anime.')],
        [
          t('上の線', 'The bar at the top'),
          t(
            'そのクールの人気作のうち、答えた数です。矢印や年・季節を選ぶと、ほかのクールに移れます。',
            'Shows how many of that season’s popular anime you’ve answered. Use the arrows, or pick a year and season, to move to another season.',
          ),
        ],
      ],
    },
    {
      id: 'match',
      title: t('マッチング', 'Match'),
      items: [
        [
          t('提案してもらう', 'Get suggestions'),
          t('あなたの評価から好みを調べて、まだ記録していない作品を1枚ずつ提案します。', 'Anipair learns your taste from your ratings and suggests anime you haven’t recorded yet, one at a time.'),
        ],
        [t('気になる作品', 'Anime that interest you'), t('「見たい」を押すと、Annictの見たいリストに入ります。', 'Tap “Want to watch” to add it to your Annict Want to watch list.')],
        [
          t('気にならない作品', 'Anime that don’t interest you'),
          t(
            '興味が無ければ「興味なし」（3ヶ月は出ません）、今は決めないなら「保留」（1週間後にまた出ます）。',
            'Tap “Not interested” if it doesn’t appeal to you (it won’t show for 3 months), or “Later” if you’re not sure yet (it comes back after 1 week).',
          ),
        ],
        [t('見たことがある作品', 'Anime you’ve seen'), t('「見たことがある」から評価できます。', 'Tap “Seen it” to rate it.')],
        [
          t('条件', 'Filters'),
          t(
            '形式（TV・劇場版など）と放送年で絞れます。好きな作品を評価するほど、提案が好みに寄っていきます。',
            'Narrow by format (TV, movie, and so on) and air year. The more anime you rate, the closer the suggestions get to your taste.',
          ),
        ],
      ],
    },
    {
      id: 'records',
      title: t('記録', 'Records'),
      items: [
        [
          t('一覧', 'Lists'),
          t(
            'Annictの記録を、見てる・見た・見たい・視聴中断に分けて並べます。表紙か題名を押すと、作品の詳細を開きます。',
            'Your Annict records are sorted into Watching, Watched, Want to watch, and Dropped. Tap a cover or title to open the anime’s details.',
          ),
        ],
        [
          t('見てる作品', 'Anime you’re watching'),
          t(
            'カードに次の話と残りの話数が出ます。カードの4段階の評価を押すと、その話をその場で記録できます。一覧の上で見るサービスを選ぶと、放送中の作品に次の放送日が出て、「今週の放送」でこれから7日の放送を日ごとに見られます。',
            'Each card shows the next episode and how many are left. Tap one of the four ratings on the card to record that episode on the spot. Pick where you watch above the list to see the next air date on airing anime, and use “This week” to see the next 7 days of broadcasts by day.',
          ),
        ],
        [
          t('クールで絞る', 'Filter by season'),
          t(
            '一覧の上の「すべて・前期・今期・来期」と矢印・年・季節で、そのクールの作品だけにできます。',
            'Use “All”, “Last season”, “This season”, and “Next season” above the list, plus the arrows and the year and season pickers, to show only that season’s anime.',
          ),
        ],
        [
          t('見たいの優先とメモ', 'Priority and notes for Want to watch'),
          t('表紙の右上の☆で「優先して見る」の印を付けられます。メモは作品の詳細から書けます。', 'Tap the ☆ at the top right of a cover to mark it “Watch first”. You can write notes from the anime’s details.'),
        ],
        [
          t('話ごとの記録', 'Episode records'),
          t(
            '「見た」「見てる」の作品を押して詳細を開くと、「話ごとの記録」で話を4段階で評価してAnnictに記録できます。評価を押すと、同じ場所に次の話が出るので、続けて押せます。‹ › か、下に並ぶ話の一覧から、ほかの話も選べます。見てる作品は最終話まで記録すると、作品の評価を付けて「見た」にできます。記録済みの話を選ぶと、評価のボタンの代わりに前回の評価が出ます。見返して2回目の記録を付けるときは「もう一度記録する」を押します（前の記録はそのまま残ります）。この画面で記録した話は、選び直せば「取り消す」で取り消せます。前に付けた記録の評価を直したり消したりするのは、「Annictで直す」から開くAnnictの話のページでできます。記録欄の右下の「感想を書く」で、その話の感想も残せます。書いてから評価を押せば一緒に記録し、評価したあとに押せばその記録に付けます（書かなくても記録はできています）。',
            'Open a Watched or Watching anime and use “Episode records” to rate episodes in four steps and record them on Annict. After you tap a rating, the next episode appears in the same place, so you can keep tapping. Use ‹ › or the episode list below to pick other episodes. Once you’ve recorded the last episode of an anime you’re watching, you can rate the whole anime and mark it Watched. When you pick an episode that’s already recorded, your previous rating is shown instead of the rating buttons. To record a second time when rewatching, tap “Record again” (the earlier record stays). An episode you recorded on this screen can be undone with “Undo” if you select it again. To fix or delete the rating on an earlier record, use “Edit on Annict” to open the episode’s page on Annict. “Write a review” at the bottom right of the record area lets you leave a review for that episode. If you write one first and then tap a rating, they’re recorded together; if you tap it after rating, it’s added to that record (you can also record without writing anything).',
          ),
        ],
        [
          t('絞り込み', 'Filter'),
          t('評価・放送年・季節・形式・ジャンル・制作会社で絞り込めます。かけた条件は一覧の上に出て、押すと外せます。', 'Filter by rating, air year, season, format, genre, or studio. Active filters show above the list; tap one to remove it.'),
        ],
        [
          t('並べ替え', 'Sort'),
          t(
            '好きな順（あなたの評価の高い順。見たの一覧だけ）・人気順・記録順・放送日順。押している並べ替えをもう一度押すと、向きが逆になります。',
            'Favorites (your highest ratings first; Watched list only), popular, recorded date, or air date. Tap the current sort again to reverse the order.',
          ),
        ],
        [t('編集', 'Edit'), t('一覧のまま、状態や評価を変えられます。', 'Change status or ratings without leaving the list.')],
        [
          t('まとめ', 'Summary'),
          t('傾向・年間ふり返り・実績です。スマホでは上の「まとめ」から、PCでは左の列から開きます。', 'Trends, Year in review, and Achievements. On a phone, open them from “Summary” at the top; on a computer, from the left column.'),
        ],
        [
          t('傾向', 'Trends'),
          t(
            '見た本数・完走率・評価の分布と世間との甘口辛口・ジャンルの好み・黄金期・隠れた名作・よく見る声優や監督などを、図で見られます。',
            'See charts of how many anime you’ve watched, your completion rate, your rating distribution and how generous you are compared with others, your favorite genres, your golden era, hidden gems, and the voice actors and directors you watch most.',
          ),
        ],
        [
          t('実績', 'Achievements'),
          t('答えた数やクールの踏破で手に入る称号を見られます。手に入れた称号を押すと、プロフィールに掲げられます。', 'See the titles you earn by answering anime and completing seasons. Tap a title you’ve earned to display it on your profile.'),
        ],
      ],
    },
    {
      id: 'browse',
      title: t('ブラウズ', 'Browse'),
      items: [
        [
          t('探す', 'Finding anime'),
          t('クールごとの作品の一覧と、タイトルでの検索です。「前期・今期・来期」ですぐに移れます。', 'Browse the anime list for each season, or search by title. “Last season”, “This season”, and “Next season” take you there quickly.'),
        ],
        [
          t('並べ替え', 'Sort'),
          t(
            '人気順（見た人の多い順）・評価順（ほかの人の評価が高い順）・おすすめ順（あなたの好みに合いそうな順）・放送日順。押している並べ替えをもう一度押すと、向きが逆になります。',
            'Popular (most watched first), rating (highest rated by others first), suggested (most likely to match your taste first), or air date. Tap the current sort again to reverse the order.',
          ),
        ],
        [
          t('絞り込み', 'Filter'),
          t(
            '放送年（から〜まで）と季節を選ぶと、クールの代わりにその期間の作品を見られます。タイトルで検索しているときも使えます。自分の記録（未記録・見たなど）・形式・ジャンル・制作会社でも絞り込めます。',
            'Pick an air year range (from–to) and seasons to see anime from that period instead of a single season. It also works while searching by title. You can also filter by your own records (Not recorded, Watched, and so on), format, genre, or studio.',
          ),
        ],
        [
          t('詳細', 'Details'),
          t('作品を押すと開きます。状態と評価を付けられ、あらすじ・キャスト・スタッフ・関連作品も読めます。', 'Tap an anime to open it. Set a status and rating, and read the synopsis, cast, staff, and related anime.'),
        ],
        [t('関連作品', 'Related anime'), t('題名を押すと、その作品の詳細を重ねて開きます。そこでも、そのまま記録できます。', 'Tap a title to open that anime’s details on top. You can record it right there, too.')],
        [
          t('声優・スタッフ・制作会社', 'Voice actors, staff, and studios'),
          t('詳細のキャストやスタッフの名前を押すと、その人や制作会社が参加した作品が並びます。', 'Tap a name in the cast or staff in the details to see other anime that person or studio worked on.'),
        ],
      ],
    },
    {
      id: 'settings',
      title: t('設定', 'Settings'),
      items: [
        [t('Annict連携', 'Annict connection'), t('ログインとログアウトです。記録はすべて、あなたのAnnictに保存されます。', 'Log in and log out here. All your records are saved to your Annict account.')],
        [
          t('GitHub連携（任意）', 'GitHub sync (optional)'),
          t(
            '興味なし・保留・見てない・見たいの印とメモ・見るサービスをPCとスマホで共有でき、毎日自動でバックアップされます。連携しなくても、記録をファイルに書き出せます。',
            'Your Not interested, Later, and Haven’t seen marks, Want to watch notes, and Where I watch choices are shared between your computer and phone, and backed up automatically every day. Even without connecting, you can export your records to a file.',
          ),
        ],
        [
          t('表示', 'Display'),
          t(
            'テーマの色・明るさ・時刻で色を変えるか・片手操作・画面の動き・見るサービスを選べます。',
            'Choose the theme color, brightness, whether colors change with the time of day, one-handed mode, motion, and where you watch.',
          ),
        ],
        [
          t('ボタン・演出・キー', 'Buttons, effects, and keys'),
          t(
            '評価とマッチングのボタンの表示（アイコンと名前・アイコンだけ・名前だけ）、演出の強さ（ふつう・控えめ・なし）、PCのキーの割り当てを変えられます。',
            'Change how the Rate and Match buttons look (icon and name, icon only, or name only), the effect strength (normal, subtle, or off), and the keyboard shortcuts on a computer.',
          ),
        ],
      ],
    },
  ]
}

function common(): readonly Item[] {
  return [
    [
      t('画面を替える', 'Switching screens'),
      t(
        'スマホは下、PCは上の帯で替えます。スマホでは画面を左右に払っても、PCでは ← → でも替わります。',
        'Use the bar at the bottom on a phone, or at the top on a computer. On a phone you can also swipe left or right; on a computer, press ← →.',
      ),
    ],
    [
      t('コントロールセンター', 'Control center'),
      t(
        '各画面の右上のボタンです。保存できなかった記録などの知らせと、テーマの色・明るさ・画面の動きなどのクイック設定があります。',
        'The button at the top right of every screen. It shows notifications, such as records that couldn’t be saved, and quick settings like theme color, brightness, and motion.',
      ),
    ],
    [
      t('閉じる', 'Closing'),
      t(
        '右上の ✕ で閉じます（スマホで片手操作を左手にしていれば左上）。スマホでは下へ払っても閉じます。作品の詳細は右へ払っても、下から出る小さな画面は空いている所をタップしても閉じます。PCではEscでも閉じます。',
        'Close with the ✕ at the top right (top left if you set one-handed mode to the left on a phone). On a phone you can also swipe down. Anime details also close with a swipe to the right, and small sheets that slide up from the bottom close when you tap an empty area. On a computer, press Esc.',
      ),
    ],
    [
      t('いちばん上へ', 'Back to top'),
      t('長い一覧では、下の隅に出るボタンか、いまの画面の帯をもう一度押すと先頭に戻ります。', 'In a long list, tap the button in the bottom corner, or tap the current screen in the bar again, to jump back to the top.'),
    ],
    [
      t('キーボード', 'Keyboard'),
      t(
        'PCではキーボードだけでも答えられます。キーはボタンの横に出ていて、設定で変えられます。← → で画面を切り替えられます。',
        'On a computer you can answer with the keyboard alone. The keys are shown next to the buttons and can be changed in Settings. Press ← → to switch screens.',
      ),
    ],
  ]
}

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

// 画面の見出しの右端に置く「?」。onOpenChange は、開いているあいだ画面のキー操作を止めるため（評価・マッチング）。
// 案内もシートも画面の一番外（body）に出す。画面の中の重なりの順（z-index）に隠されないように
type Mode = { kind: 'tour'; steps: ReturnType<typeof presentSteps> } | { kind: 'text' } | { kind: 'feedback' } | null

export function HelpButton(props: { topic: HelpTopic; active?: boolean; onOpenChange?: (open: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<Mode>(null)
  const change = (next: Mode) => {
    setMode(next)
    props.onOpenChange?.(next !== null)
  }
  const open = () => {
    const root = ref.current?.closest('.app__screen, main') ?? document
    const steps = presentSteps(root, tours(props.topic))
    // 示せるボタンが1つも無いとき（読み込み中など）は、文章の使い方を出す
    change(steps.length > 0 ? { kind: 'tour', steps } : { kind: 'text' })
  }
  return (
    <>
      <button ref={ref} type="button" className="helpbtn" aria-label={t('使い方', 'How to use')} title={t('使い方', 'How to use')} onClick={open}>
        <HelpIcon />
      </button>
      {mode?.kind === 'tour' && <Tour label={t('使い方', 'How to use')} steps={mode.steps} onClose={() => change(null)} onText={() => change({ kind: 'text' })} />}
      {mode?.kind === 'text' &&
        createPortal(
          <HelpSheet topic={props.topic} active={props.active} onClose={() => change(null)} onFeedback={() => change({ kind: 'feedback' })} />,
          document.body,
        )}
      {mode?.kind === 'feedback' && createPortal(<FeedbackSheet active={props.active} onClose={() => change(null)} />, document.body)}
    </>
  )
}
