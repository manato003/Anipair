<h1 align="center">
  <img src="public/logo-mark.svg" width="72" alt=""><br>
  Anipair
</h1>

<p align="center"><strong>あなたの「好き」と、次の「好き」をつなぐ。</strong></p>

[Annict](https://annict.com/) の視聴記録を、タップだけで付けていくためのアプリです。見たアニメを1タップで評価でき、評価から好みを推定して、まだ見ていない作品も提案します。記録はすべて自分の Annict に保存されます。

Annict の非公式の個人開発アプリです（Annict とは関係がありません）。公開版: https://anipair.vercel.app/

| 評価 | マッチング | 作品の詳細 |
|---|---|---|
| <img src="screenshots/rate-phone.png" width="240" alt="評価の画面"> | <img src="screenshots/match-phone.png" width="240" alt="マッチングの画面"> | <img src="screenshots/detail-phone.png" width="240" alt="作品の詳細"> |

<img src="screenshots/rate-pc.png" width="720" alt="PC の画面">

## できること

- **評価**: クールごとに過去の作品をさかのぼって、見た・見たい・評価（4段階）を1タップで付ける。見てる作品の整理もできる
- **マッチング**: 自分の評価から好みを推定して、まだ見ていない作品を1枚ずつ提案する（Shikimori のジャンル・テーマと「似た作品」を使う）
- **記録**: 見た・見たい・見てる・中断/中止の一覧と編集、評価の傾向
- **ブラウズ**: クール一覧とタイトル検索、作品の詳細（あらすじ・キャスト・スタッフ・配信サービス）
- PC ではキーボードだけでも操作できる（キーの割り当ても変えられる）

## 使うために必要なもの

**Annict のアカウント**が必要です。アプリの最初の画面で「Annict でログイン」を押すと使い始められます。

## GitHub とつなぐ（任意）

なぜ GitHub なのか: パス・スルー・「見てない」は Anipair だけの印で、Annict には記録する場所がありません。Anipair は運営のサーバーを持たない（利用者の情報を預からない）ので、端末をまたいで残したい人は、自分の GitHub のリポジトリを置き場所に使います。評価や見た・見たいなど、Annict にある項目はつながなくても Annict に保存されます。

つながなくても、評価・マッチング・記録・ブラウズはすべて使えます。つなぐと、次のことが増えます。

- パス・スルー・「見てない」にした作品を、PC とスマホで共有する（つながない場合は、端末ごとの記録になります）
- 全記録を、自分の GitHub のリポジトリに毎日バックアップする（履歴つき）

つながない場合でも、設定の「ファイルに書き出す」で、全記録を JSON ファイルとして保存できます。

つなぎ方（アプリの設定にも同じ手順があります）:

1. 自分の GitHub に private リポジトリを作る（例: `anipair-data`）
2. [Fine-grained トークン](https://github.com/settings/personal-access-tokens/new)を、そのリポジトリだけ・Contents を「Read and write」にして作る
3. 設定の「GitHub とつなぐ」に、リポジトリ名（`ユーザー名/anipair-data`）とトークンを入れて「つなぐ」

## データの置き場所

| データ | 置き場所 |
|---|---|
| 見た・見たい・評価などの記録 | あなたの Annict |
| パス・スルー・見てない | この端末のブラウザ（GitHub とつないだ場合は、あなたの private リポジトリにも） |
| トークン・設定・キーの割り当て | この端末のブラウザの中だけ |

運営のサーバーはありません。ログインの受け渡しと Shikimori への中継をする関数があるだけで、利用者の情報は何も保存しません。通信先は Annict と、作品データの Shikimori（このサイトの中継を通します）で、GitHub とつないだ場合だけ GitHub にも送ります。

## 注意

- 非公式の個人開発アプリです。Annict の API はベータ版で、予告なく変わることがあります。変わると、動かなくなる機能が出るかもしれません
- 表紙は Shikimori のポスターを優先し、無ければ Annict の API の画像（作品の公式サイトのもの）を表示しています。画像の権利は各権利者にあります
- 作品の詳細に出すあらすじは、Annict の作品ページから読んで、引用元を付けて表示しています

## 開発

Vite + React + TypeScript の静的サイトです（ログインの受け渡しだけ、Vercel の関数 `api/annict-token.ts`）。

```
npm install
npm run dev
```

`http://localhost:5173` が開きます（Shikimori への中継は、開発サーバーの中で同じ処理が動きます）。

- **個人用アクセストークンで使う**: ローカルでは「Annict でログイン」のボタンが出ません（ログインの関数が動かないため）。最初の画面の「開発者向け: 個人用アクセストークンで使う」を開き、Annict の[アプリケーションの設定](https://annict.com/settings/apps)で作った個人用アクセストークン（権限は「読み込み + 書き込み」）を貼ってください
- **「Annict でログイン」をローカルで試す**: Annict に[アプリケーションを登録](https://annict.com/oauth/applications)し（スコープは「読み込み + 書き込み」、リダイレクト URI は `http://localhost:3000/`）、`.env.example` を見て `.env.local` に値を入れてから、`vercel dev` で起動します
- **自分で公開する**（公開版を使うだけなら不要です）: このリポジトリをフォークして Vercel につなぎ、`.env.example` にある4つの環境変数を設定します（`ANNICT_CLIENT_SECRET` などに `VITE_` を付けないでください。付けると公開の JS に入ります）。Annict のアプリケーションのリダイレクト URI には、公開するアドレス（末尾のスラッシュまで）を登録します

```
npm run lint
npm run typecheck
npm test
npm run build
```

## 謝辞

- [Annict](https://annict.com/) — 記録の保存先とデータ。ありがとうございます
- [Shikimori](https://shikimori.io/) — 作品データの一部（ジャンル・テーマ・似た作品・一部の表紙）

## ライセンス・規約

[MIT](LICENSE)

- [利用規約](https://anipair.vercel.app/terms.html)
- [プライバシーポリシー](https://anipair.vercel.app/privacy.html)
