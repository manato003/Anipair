import { Section } from './Section'

// 設定の「最新情報」。公式の X と、開発日誌（Zenn の記事）。
// 前は「このアプリ」と「お問い合わせ」の薄い補足の中にあって、見つからなかった（#30。2026-10-13 利用者の発案で、項目を分けた）
// 記事の一覧は代表のものだけを並べ、新しい記事は Zenn のプロフィールからたどってもらう（記事を出すたびにアプリを直さないため。2026-10-19 利用者）
const X_URL = 'https://x.com/anipairAPP'
const ZENN_PROFILE_URL = 'https://zenn.dev/manato003'
const ARTICLES = [
  {
    title: 'Annictの記録をタップで付けて、次に見るアニメを理由つきで提案するWebアプリを作った',
    url: 'https://zenn.dev/manato003/articles/anipair-annict-anime-app',
  },
  {
    title: '公開APIを使わせてもらう側として、負担をかけないクライアント作りで意識したこと',
    url: 'https://zenn.dev/manato003/articles/anipair-gentle-api-client',
  },
] as const

export function NewsBlock() {
  return (
    <>
      <Section id="settings-x" title="公式X" summary="最新情報や、Anipairを使うときに役立つことを投稿しています。">
        <div className="settings__actions">
          <a className="btn" href={X_URL} target="_blank" rel="noreferrer">
            Xで@anipairAPPを見る
          </a>
        </div>
      </Section>
      <Section id="settings-devlog" title="Anipair開発日誌" summary="作ったものの仕組みや、作りながら考えたことをZennに書いています。">
        <ul className="devlog">
          {ARTICLES.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.title}
              </a>
            </li>
          ))}
        </ul>
        <div className="settings__actions">
          <a className="btn" href={ZENN_PROFILE_URL} target="_blank" rel="noreferrer">
            Zennの記事をすべて見る
          </a>
        </div>
      </Section>
    </>
  )
}
