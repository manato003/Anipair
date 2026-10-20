import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Sheet } from '../../components/Sheet'
import { Loading } from '../../components/Loading'
import { getLang, t, tx, type Text } from '../../lib/i18n'

// 利用規約とプライバシーポリシー。中身は public/ の静的なページ（ログイン前の人や、外からも開けるように URL のあるページとして置く）。
// アプリの中から開いたときは、別のタブで開かずに、同じページの中身を読んで「中身を開く1枚」で見せる（閉じると、開いた画面に戻る）
// 英語の画面では、ページの後ろにある英語の節（section.en）から見せる

type Doc = '/terms.html' | '/privacy.html'

const DOCS: { href: Doc; label: Text }[] = [
  { href: '/terms.html', label: { ja: '利用規約', en: 'Terms of Use' } },
  { href: '/privacy.html', label: { ja: 'プライバシーポリシー', en: 'Privacy Policy' } },
]

export function LegalLinks(props: { className?: string }) {
  const [open, setOpen] = useState<Doc | null>(null)
  const show = (href: Doc) => (e: MouseEvent) => {
    // 新しいタブで開く操作（Ctrl・⌘・中ボタン）は、そのままにする
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    setOpen(href)
  }
  return (
    <>
      <p className={props.className}>
        {DOCS.map((d) => (
          <a key={d.href} href={d.href} onClick={show(d.href)}>
            {tx(d.label)}
          </a>
        ))}
      </p>
      {open && <LegalSheet doc={open} onOpen={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

// 自分のサイトの静的なページなので、本文（main）をそのまま描く。上の段（アプリの名前と戻るボタン）は外す
function LegalSheet(props: { doc: Doc; onOpen: (doc: Doc) => void; onClose: () => void }) {
  const lang = getLang()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(props.doc)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((text) => {
        if (cancelled) return
        const main = new DOMParser().parseFromString(text, 'text/html').querySelector('main')
        main?.querySelector('.top')?.remove()
        // 外のサイトへのリンクは新しいタブで
        main?.querySelectorAll('a[href^="http"]').forEach((a) => a.setAttribute('target', '_blank'))
        setHtml(main?.innerHTML ?? '')
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [props.doc])

  // 規約からポリシーへのリンクなどは、このシートの中で切り替える
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element).closest('a')
    const href = a?.getAttribute('href')
    if (href === '/terms.html' || href === '/privacy.html') {
      e.preventDefault()
      setHtml(null)
      props.onOpen(href)
    }
  }

  // 英語のときは、英語の節まで送る（描いたあと）
  useEffect(() => {
    if (html === null || lang !== 'en') return
    bodyRef.current?.querySelector('section.en')?.scrollIntoView({ block: 'start' })
  }, [html, lang])

  const doc = DOCS.find((d) => d.href === props.doc)
  const label = doc ? tx(doc.label) : ''
  return (
    <Sheet label={label} size="page" onClose={props.onClose}>
      {html === null && !error && <Loading label={t(`${label}を読み込み中`, `Loading ${label}`)} />}
      {error && (
        <p className="settings__error">
          {t(`${label}を読み込めませんでした（${error}）。`, `Couldn’t load the ${label} (${error}). `)}
          <a href={props.doc}>{t('ページで開く', 'Open the page')}</a>
        </p>
      )}
      {/* 自分のサイトの静的なページの本文（利用者の入力は含まない） */}
      {html !== null && <div ref={bodyRef} className="legal" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />}
    </Sheet>
  )
}
