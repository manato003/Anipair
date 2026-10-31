import { tx, type Text } from '../lib/i18n'

// よくある質問（ヘルプの「文章で詳しく読む」の中に出す）。届いた問い合わせのうち、何度も来るものを足していく。
// 外に出る文章なので、Annict に配慮した言い方にする（CLAUDE.md）。機能の説明は、画面とコードで確かめてから書く。
// 答えは、まず短い答え（1文。太字で出す）、そのあとに説明（無ければ空）の形にそろえる
// 英語の文言は、ボタンや項目の名前を画面の英語に合わせる

interface FaqItem {
  question: Text
  short: Text
  detail: Text
}

const ITEMS: readonly FaqItem[] = [
  {
    question: { ja: 'Annictの公式アプリですか？', en: 'Is this an official Annict app?' },
    short: { ja: 'いいえ、非公式のアプリです。', en: 'No, it’s an unofficial app.' },
    detail: {
      ja: 'AnnictのAPIを使って個人が開発していて、Annictの運営とは関係ありません。Anipairについてのご質問は、Annictではなく下の「質問・不具合・要望を送る」からお送りください。',
      en: 'It’s built by an individual using Annict’s API and isn’t affiliated with the Annict team. For questions about Anipair, please use “Send feedback” below rather than contacting Annict.',
    },
  },
  {
    question: { ja: '記録はどこに保存されますか？', en: 'Where are my records saved?' },
    short: {
      ja: '見た・評価・感想などはあなたのAnnictに、Anipairだけの印とメモはこの端末に保存されます。',
      en: 'Watched, ratings, reviews, and the like go to your Annict account. Marks and notes that exist only in Anipair stay on this device.',
    },
    detail: {
      ja: 'Annictに保存するのは、見た・見てる・見たい・視聴中断、評価、感想、話ごとの記録です。Annictのサイトからも同じ記録が見えるので、Anipairを使わなくなっても残ります。「見てない」「興味なし」「保留」の印や見たいのメモ、Tier表はAnnictに置けないので、この端末に残します。設定でGitHubと連携すると、あなたのGitHubのリポジトリにも保存して、ほかの端末と共有できます。',
      en: 'Annict stores Watched, Watching, Want to watch, and Dropped, plus ratings, reviews, and episode records. The same records are visible on the Annict website, so they stay even if you stop using Anipair. “Haven’t seen”, “Not interested”, and “Later” marks, Want to watch notes, and tier lists can’t be stored on Annict, so they’re kept on this device. If you connect GitHub in Settings, they’re also saved to a repository in your GitHub account so you can share them with your other devices.',
    },
  },
  {
    question: { ja: '提案はどうやって決めていますか？', en: 'How are suggestions chosen?' },
    short: {
      ja: '好きな作品に似た作品を集め、「推されている強さ」と「好みとの重なり」で点数を付けて、高い順に出しています。',
      en: 'Anipair gathers anime similar to the ones you like, scores them by how strongly they’re recommended and how well they fit your taste, and shows the highest first.',
    },
    detail: {
      ja: '評価した作品ごとに、作品データの提供元（Shikimori）の「似た作品」を集めます。高く評価した作品や、いくつもの好きな作品から挙がった作品ほど強く推し、低い評価や視聴中断の作品から挙がった作品は弱めます。そこに、評価から推し量ったジャンル・テーマ・制作会社の好みとの重なりを足し、好きな作品の続編・前作は上乗せします。前作を見ていない続編や、苦手な項目に当たる作品は除きます。評価を付けるほど、好みの推し量りが正確になります。',
      en: 'For each anime you’ve rated, Anipair collects the “Similar anime” from its anime data provider (Shikimori). Anime that come from ones you rated highly, or from several anime you like, are recommended more strongly, while those that come from anime you rated low or dropped are weakened. On top of that, it adds how well each anime overlaps with the genres, themes, and studios your ratings suggest you like, and gives a boost to sequels and prequels of anime you like. Sequels whose earlier season you haven’t seen, and anime that hit what you avoid, are left out. The more you rate, the better it gets at reading your taste.',
    },
  },
  {
    question: { ja: '提案の顔ぶれを変えるには？', en: 'How do I get different suggestions?' },
    short: { ja: 'カードに答えると、次の候補が繰り上がります。', en: 'Answer the cards, and the next suggestions move up.' },
    detail: {
      ja: '提案は点数の順で、乱数は使っていません。記録が同じなら、同じ並びになります。見た・見たい・興味なし・保留などで答えた作品は候補から外れます（興味なしは3ヶ月、保留は1週間たつとまた候補に戻ります）。評価を足したり変えたりすると好みが変わり、「候補の条件」で形式・放送年・苦手な項目を変えると、並びも変わります。',
      en: 'Suggestions are ordered by score, with no randomness, so the same records give the same order. Anime you answer with Watched, Want to watch, Not interested, Later, and so on drop out of the suggestions (Not interested comes back after 3 months, and Later after a week). Adding or changing ratings changes your taste, and changing the format, air year, or what you avoid in “Suggestion filters” changes the order too.',
    },
  },
  {
    question: { ja: 'マッチングが初めてのときだけ時間がかかるのはなぜですか？', en: 'Why does Match take a while the first time?' },
    short: { ja: '作品ごとの「似た作品」を、初めて調べるためです。', en: 'Because it’s looking up the “Similar anime” for each anime for the first time.' },
    detail: {
      ja: '調べた結果はこの端末に控えるので、2回目からは速くなります。記録が多いときは、評価の高い作品から先に調べて提案し、残りは裏で調べ続けます。',
      en: 'The results are saved on this device, so it’s faster from the second time on. If you have a lot of records, it looks up your highest-rated anime first and starts suggesting, then keeps checking the rest in the background.',
    },
  },
  {
    question: {
      ja: 'Annictには「一時中断」と「視聴中止」がありますが、Anipairで分けられないのはなぜですか？',
      en: 'Annict has both “On hold” and “Stopped watching”. Why doesn’t Anipair keep them separate?',
    },
    short: { ja: '「途中で見るのをやめた」を、迷わず1回で記録できるようにするためです。', en: 'So that “I stopped watching partway” can be recorded in one tap, without hesitating.' },
    detail: {
      ja: 'Anipairは見たアニメをすばやく記録できることを大事にしていて、「1つの気持ちに、1つのボタン」を設計の考え方にしています。1つの気持ちに2つのボタンがあると、記録するたびに「中断」か「中止」かで迷いやすいので、「視聴中断」の1つにまとめました。Anipairで付けた視聴中断は、Annictには「視聴中止」として保存されます。Annictのサイトで付けた「一時中断」はそのまま残り、Anipairでは「視聴中断」と表示します。2つを分けて記録したいときは、Annictのサイトで付け替えられます。',
      en: 'Anipair is built around recording what you’ve watched quickly, and its design principle is “one feeling, one button”. With two buttons for the same feeling, it’s easy to hesitate between “on hold” and “stopped watching” every time you record, so they’re combined into a single “Dropped”. When you mark an anime “Dropped” in Anipair, it’s saved to Annict as “Stopped watching”. “On hold” set on the Annict website stays as it is, and Anipair shows it as “Dropped”. If you want to record the two separately, you can change the status on the Annict website.',
    },
  },
  {
    question: { ja: '記録した話の評価を変えたり、記録を消したりできますか？', en: 'Can I change the rating of an episode I recorded, or delete a record?' },
    short: { ja: 'できます。', en: 'Yes.' },
    detail: {
      ja: '記録してすぐなら、記録欄の「取り消す」で取り消して付け直せます（作品の詳細を閉じるまで）。前に付けた記録は、記録済みの話を選んだときに出る「Annictで直す」から、Annictの話のページで直したり消したりできます。「もう一度記録する」は見返したとき用で、前の記録はそのままに2回目の記録が増えます。',
      en: 'Right after recording, tap “Undo” in the record area and rate again (until you close the anime’s details). For an earlier record, select the recorded episode and use “Edit on Annict” to change or delete it on the episode’s page on Annict. “Record again” is for rewatching: it keeps the earlier record and adds a second one.',
    },
  },
  {
    question: { ja: '次の放送日が出ない作品があるのはなぜですか？', en: 'Why don’t some anime show a next air date?' },
    short: { ja: '放送予定がAnnictに登録されていないか、選んだサービスでの放送が無いためです。', en: 'Either no schedule is registered on Annict, or it isn’t airing on the services you picked.' },
    detail: {
      ja: '放送予定はAnnictに登録された情報を使っています。見るサービスは記録の「見てる」の上か、設定の「表示」で選べます。',
      en: 'Air dates use the schedule registered on Annict. You can pick where you watch above the Watching list in Records, or under “Display” in Settings.',
    },
  },
  {
    question: { ja: '表紙が出ない作品があるのはなぜですか？', en: 'Why don’t some anime have a cover?' },
    short: { ja: '表紙の画像が見つからないか、読み込めないためです。', en: 'The cover image either can’t be found or can’t be loaded.' },
    detail: {
      ja: '表紙には作品データの提供元（Shikimori）の画像と、各作品の公式サイトの画像を使っています。どちらにも無い作品や、読み込めない画像は、表紙なしで表示します。',
      en: 'Covers use images from the anime data provider (Shikimori) and from each anime’s official website. Anime that have neither, and images that fail to load, are shown without a cover.',
    },
  },
  {
    question: { ja: 'アプリのように開けますか？', en: 'Can I open it like an app?' },
    short: { ja: 'ブラウザの「ホーム画面に追加」で、アプリのように開けます。', en: 'Yes. Use your browser’s “Add to Home Screen” to open it like an app.' },
    detail: {
      ja: 'iPhoneはSafariの共有ボタンから「ホーム画面に追加」、AndroidとPCはChromeのメニューから追加できます。ホーム画面から開くと、アドレスバーなどのないアプリの画面で開きます。',
      en: 'On iPhone, use “Add to Home Screen” from Safari’s Share button. On Android and PC, add it from Chrome’s menu. Opened from the home screen, it runs in its own window without the address bar.',
    },
  },
  {
    question: { ja: 'アクセス解析はしていますか？', en: 'Do you use analytics?' },
    short: { ja: 'しています。', en: 'Yes.' },
    detail: {
      ja: 'どの画面がどれくらい開かれたかを、Vercel Web Analyticsで集計しています。送るのは、開いた画面の名前・どこから来たか・国や地域・端末とブラウザの種類です。Cookieは使わず、Annictのアカウントや記録、入力した内容は送りません。詳しくはプライバシーポリシーにあります。',
      en: 'Anipair uses Vercel Web Analytics to count how often each screen is opened. It sends the name of the screen, where the visit came from, the country or region, and the device and browser type. No cookies are used, and your Annict account, your records, and anything you type are never sent. See the Privacy Policy for details.',
    },
  },
  {
    question: { ja: 'この端末の記録を消したいときは？', en: 'How do I delete the data on this device?' },
    short: {
      ja: '設定の「アカウント」の「詳しく」にある「ログアウトして、Anipairのデータを削除」で消せます。',
      en: 'In Settings, open “Details” under “Account” and use “Log out and delete Anipair’s data”.',
    },
    detail: { ja: 'Annictの記録は消えません。', en: 'Your Annict records aren’t deleted.' },
  },
  {
    question: { ja: '別のAnnictアカウントに切り替えたいときは？', en: 'How do I switch to a different Annict account?' },
    short: {
      ja: 'Anipairからログアウトしてから、Annictのサイトでアカウントを切り替えてください。',
      en: 'Log out of Anipair, then switch accounts on the Annict website.',
    },
    detail: {
      ja: 'Annictのサイトで連携したいアカウントにログインしたあと、Anipairで「Annictでログイン」を押すと、そのアカウントで使えます。',
      en: 'After logging in to the account you want to connect on the Annict website, tap “Log in with Annict” in Anipair to use that account.',
    },
  },
]

type FaqRow = readonly [question: string, short: string, detail: string]

// 1行 = [質問, 短い答え, 説明]。言語を替えると文言も替わるように、中身は読んだときに選ぶ（getter）。
// 形は変えないので、使う側は FAQ.map(([q, a]) => …) のままでよい
function row(item: FaqItem): FaqRow {
  const out: string[] = []
  const fields = [item.question, item.short, item.detail]
  fields.forEach((text, i) => Object.defineProperty(out, i, { get: () => tx(text), enumerable: true }))
  return out as unknown as FaqRow
}

export const FAQ: readonly FaqRow[] = ITEMS.map(row)
