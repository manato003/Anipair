import { tx, type Text } from '../lib/i18n'

// よくある質問（ヘルプの「文章で詳しく読む」の中に出す）。届いた問い合わせのうち、何度も来るものを足していく。
// 外に出る文章なので、Annict に配慮した言い方にする（CLAUDE.md）。機能の説明は、画面とコードで確かめてから書く。
// 答えは、まず短い答え（1文。太字で出す）、そのあとに説明（無ければ空）の形にそろえる（2026-10-19 利用者）
// 英語の文言は、ボタンや項目の名前を画面の英語（用語集 docs/i18n-guide.md）に合わせる

interface FaqItem {
  question: Text
  short: Text
  detail: Text
}

const ITEMS: readonly FaqItem[] = [
  {
    question: { ja: '無料ですか？', en: 'Is it free?' },
    short: { ja: '無料です。', en: 'Yes, it’s free.' },
    detail: { ja: '広告もありません。', en: 'There are no ads either.' },
  },
  {
    question: { ja: 'Annictのアカウントは必要ですか？', en: 'Do I need an Annict account?' },
    short: { ja: '必要です。', en: 'Yes.' },
    detail: {
      ja: '記録はAnnictに保存するので、Annictのアカウントでログインして使います。AnnictのアカウントはAnnictのサイトで作れます（無料です）。',
      en: 'Your records are saved to Annict, so you log in with an Annict account. You can create one on the Annict website (it’s free).',
    },
  },
  {
    question: { ja: '記録はどこに保存されますか？', en: 'Where are my records saved?' },
    short: { ja: 'あなたのAnnictに保存されます。', en: 'They’re saved to your Annict account.' },
    detail: {
      ja: '見た・見てる・見たい・視聴中断、評価、感想、話ごとの記録が対象です。Annictのサイトからも同じ記録が見えるので、Anipairを使わなくなっても記録は残ります。',
      en: 'This covers Watched, Watching, Want to watch, and Dropped, plus ratings, reviews, and episode records. The same records are visible on the Annict website, so they stay even if you stop using Anipair.',
    },
  },
  {
    question: { ja: '「見てない」「興味なし」「保留」や、見たいのメモはどこに残りますか？', en: 'Where are “Haven’t seen”, “Not interested”, “Later”, and my Want to watch notes kept?' },
    short: { ja: 'この端末の中に残ります。', en: 'They’re kept on this device.' },
    detail: {
      ja: 'Anipairだけの記録なので、Annictには保存しません。設定でGitHubと連携すると、あなたのGitHubのリポジトリに保存して、ほかの端末と共有できます。',
      en: 'These exist only in Anipair, so they aren’t saved to Annict. If you connect GitHub in Settings, they’re saved to a repository in your GitHub account so you can share them with your other devices.',
    },
  },
  {
    question: { ja: 'スマホとPCの両方で使えますか？', en: 'Can I use it on both my phone and my computer?' },
    short: { ja: '使えます。', en: 'Yes.' },
    detail: {
      ja: 'Webアプリなので、ブラウザで開くだけです。ホーム画面に追加すると、アプリのように開けます。Annictの記録は、同じアカウントでログインすればどの端末でも同じです。',
      en: 'It’s a web app, so you just open it in a browser. If you add it to your home screen, it opens like an app. Your Annict records are the same on every device when you log in with the same account.',
    },
  },
  {
    question: { ja: 'Annictの公式アプリですか？', en: 'Is this an official Annict app?' },
    short: { ja: 'いいえ、非公式のアプリです。', en: 'No, it’s an unofficial app.' },
    detail: {
      ja: 'AnnictのAPIを使って個人が開発していて、Annictの運営とは関係ありません。Anipairについてのご質問は、Annictではなく、下の「質問・不具合・要望を送る」からお送りください。',
      en: 'It’s built by an individual using Annict’s API and isn’t affiliated with the Annict team. For questions about Anipair, please use “Send feedback” below rather than contacting Annict.',
    },
  },
  {
    question: { ja: '提案はどうやって決めていますか？', en: 'How are suggestions chosen?' },
    short: { ja: 'あなたの評価から好みを推定して決めています。', en: 'They’re based on your taste, estimated from your ratings.' },
    detail: {
      ja: '好きな作品に似た作品を集め、好きなジャンルや制作会社と重なる順に並べます。提案には「好きなジャンル」「前作を見ています」のような理由を添えます。評価が増えるほど、好みに寄ってきます。',
      en: 'Anipair gathers anime similar to the ones you like, then orders them by how well they overlap with your favorite genres and studios. Each suggestion comes with a reason, such as “Genres you like” or “You’ve seen the prequel”. The more you rate, the closer they get to your taste.',
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
    question: { ja: '記録した話の評価を変えたり、記録を消したりできますか？', en: 'Can I change the rating of an episode I recorded, or delete a record?' },
    short: { ja: 'できます。', en: 'Yes.' },
    detail: {
      ja: '記録してすぐなら、記録欄の「取り消す」で取り消して、付け直せます。続けて記録した話も、その話を選び直せば取り消せます（作品の詳細を閉じるまで）。前に付けた記録の評価を変えたり消したりするのは、記録済みの話を選んだときに出る「Annictで直す」から、Annictの話のページでできます。「もう一度記録する」は見返したとき用で、前の記録はそのままに、2回目の記録が増えます。',
      en: 'Right after recording, you can tap “Undo” in the record area and then rate again. Episodes you recorded one after another can also be undone by selecting that episode again (until you close the anime’s details). To change or delete the rating on an earlier record, use “Edit on Annict”, which appears when you select an episode that’s already recorded, and edit it on the episode’s page on Annict. “Record again” is for rewatching: it keeps the earlier record and adds a second one.',
    },
  },
  {
    question: {
      ja: 'Annictには「一時中断」と「視聴中止」がありますが、Anipairで分けられないのはなぜですか？',
      en: 'Annict has both “On hold” and “Stopped watching”. Why can’t I tell them apart in Anipair?',
    },
    short: { ja: '「途中で見るのをやめた」を、迷わず1回で記録できるようにするためです。', en: 'So that “I stopped watching partway” can be recorded in one tap, without hesitating.' },
    detail: {
      ja: 'Anipairは、見たアニメをすばやく記録できることを大事にしていて、「1つの気持ちに、1つのボタン」を設計の考え方にしています。1つの気持ちに2つのボタンがあると、記録するたびに「中断」か「中止」かで迷いやすいので、「視聴中断」の1つにまとめました。Anipairで付けた視聴中断は、Annictには「視聴中止」として保存されます。Annictのサイトで付けた「一時中断」はそのまま残り、Anipairでは「視聴中断」と表示します。2つを分けて記録したいときは、Annictのサイトで付け替えられます。',
      en: 'Anipair is built around recording what you’ve watched quickly, and its design principle is “one feeling, one button”. With two buttons for the same feeling, it’s easy to hesitate between “on hold” and “dropped” every time you record, so they’re combined into a single “Dropped”. A Dropped you set in Anipair is saved to Annict as “Stopped watching”. An “On hold” you set on the Annict website stays as it is, and Anipair shows it as “Dropped”. If you want to record the two separately, you can switch them on the Annict website.',
    },
  },
  {
    question: { ja: '次の放送日が出ない作品があるのはなぜですか？', en: 'Why don’t some anime show a next air date?' },
    short: { ja: '放送予定がAnnictに登録されていないか、選んだサービスでの放送が無いためです。', en: 'Either no schedule is registered on Annict, or it isn’t airing on the services you picked.' },
    detail: {
      ja: '放送予定は、Annictに登録された情報を使っています。見るサービスは、記録の「見てる」の上か、設定の「表示」で選べます。',
      en: 'Air dates use the schedule registered on Annict. You can pick where you watch above the Watching list in Records, or under “Display” in Settings.',
    },
  },
  {
    question: { ja: '表紙が出ない作品があるのはなぜですか？', en: 'Why don’t some anime have a cover?' },
    short: { ja: '表紙の画像が見つからないか、読み込めないためです。', en: 'The cover image either can’t be found or can’t be loaded.' },
    detail: {
      ja: '表紙には、作品データの提供元（Shikimori）の画像と、各作品の公式サイトの画像を使っています。どちらにも無い作品や、読み込めない画像は、表紙なしで表示します。',
      en: 'Covers use images from the anime data provider (Shikimori) and from each anime’s official website. Anime that have neither, and images that fail to load, are shown without a cover.',
    },
  },
  {
    question: { ja: 'アクセス解析はしていますか？', en: 'Do you use analytics?' },
    short: { ja: 'しています。', en: 'Yes.' },
    detail: {
      ja: 'どの画面がどれくらい開かれたかだけを、Vercel Web Analyticsで集計しています。送るのは、開いた画面の名前・どこから来たか・国や地域・端末とブラウザの種類です。Cookieは使わず、Annictのアカウントや記録、入力した内容は送りません。詳しくはプライバシーポリシーにあります。',
      en: 'Only how often each screen is opened is counted, using Vercel Web Analytics. What’s sent is the name of the screen opened, where the visit came from, the country or region, and the device and browser type. No cookies are used, and your Annict account, your records, and anything you type are never sent. See the Privacy Policy for details.',
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
