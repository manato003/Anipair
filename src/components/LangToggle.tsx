import { setLang, useLang, type Lang } from '../lib/i18n'

// 言語の切り替え。替えるとアプリ全体を、その言語で描き直す（Root.tsx）。
// - LangToggle: ログイン前の最初の画面の右上の「EN／あ」（いまと違う方の言語を出す）
// - LangChoices: コントロールセンターと設定の「表示」の「日本語／English」。
//   はじめは各画面の右上の並びに「EN／あ」を置いたが、スマホのマッチングの見出しが収まらず「条件」が縦に折れた。
//   言語はめったに替えないので、右上の並びからは外して、どの画面からも1回で開けるコントロールセンターに置く（2026-10-20）

// 名前は、それぞれの言語で書く（その言語を読む人が押すので）
const NAMES: readonly { value: Lang; label: string }[] = [
  { value: 'ja', label: '日本語' }, // i18n-ok
  { value: 'en', label: 'English' },
]

export function LangToggle(props: { className?: string }) {
  const en = useLang() === 'en'
  const label = en ? '日本語に切り替える' : 'Switch to English' // i18n-ok
  return (
    <button type="button" className={props.className ?? 'langbtn'} lang={en ? 'ja' : 'en'} aria-label={label} title={label} onClick={() => setLang(en ? 'ja' : 'en')}>
      {en ? 'あ' : 'EN'} {/* i18n-ok */}
    </button>
  )
}

// 見出しは両方の言語で（読めない言語の画面になっていても、ここを見つけられるように）
const LANG_HEADING = '言語 / Language' // i18n-ok

export function LangChoices() {
  const lang = useLang()
  return (
    <div className="toggle" role="group" aria-label={LANG_HEADING}>
      {NAMES.map((n) => (
        <button key={n.value} type="button" lang={n.value} aria-pressed={lang === n.value} onClick={() => lang !== n.value && setLang(n.value)}>
          {n.label}
        </button>
      ))}
    </div>
  )
}
