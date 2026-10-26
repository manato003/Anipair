import { useEffect, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { LangToggle } from '../../components/LangToggle'
import { Loading } from '../../components/Loading'
import { Logo } from '../../components/Logo'
import { t } from '../../lib/i18n'
import { shikiTitle } from '../../lib/names'
import { fetchMedia, type Media } from '../../lib/shikimori'
import { tierColor } from './tierList'
import { SharedWorkCard } from './SharedWorkCard'
import { fetchShared, type SharedTable } from './tierShare'

// 共有のリンク（/t/<ID>）で開いた Tier表。ログインしなくても見られる（アプリの本体は動かさず、端末の記録にも触れない）。
// 表の中身は api/tier.ts から、作品の題名と表紙は /api/shiki から50件ずつ引き、上の段から順に出す。表紙を押すと作品カード（SharedWorkCard）

const CHUNK = 50

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; table: SharedTable }

export function SharedTierPage(props: { id: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [media, setMedia] = useState<ReadonlyMap<number, Media>>(new Map())
  const [partial, setPartial] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await fetchShared(props.id)
      if (cancelled) return
      if (!r.ok) return setState({ status: 'error', message: r.message })
      setState({ status: 'ok', table: r.value })
      document.title = `${r.value.title || t('Tier表', 'Tier list')} | Anipair`
      const ids = r.value.tiers.flatMap((x) => x.items)
      for (let i = 0; i < ids.length; i += CHUNK) {
        try {
          const found = await fetchMedia(ids.slice(i, i + CHUNK))
          if (cancelled) return
          setMedia((cur) => new Map([...cur, ...found]))
        } catch {
          if (!cancelled) setPartial(true)
          return
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.id])

  const pickedMedia = picked !== null ? media.get(picked) : undefined
  const nameOf = (id: number) => {
    const m = media.get(id)
    return m ? shikiTitle(m.title, `MAL ${id}`) : null
  }

  return (
    <div className="sharedtier">
      <header className="sharedtier__head">
        <a href="/" aria-label={t('Anipairのトップへ', 'Go to Anipair')}>
          <Logo size="small" />
        </a>
        <LangToggle />
      </header>
      <main className="sharedtier__main">
        {state.status === 'loading' && <Loading label={t('表を読み込んでいます', 'Loading the tier list')} />}
        {state.status === 'error' && <p className="note sharedtier__error">{state.message}</p>}
        {state.status === 'ok' && (
          <>
            <div className="tierboard">
              {state.table.title && <h1 className="tierboard__title">{state.table.title}</h1>}
              {state.table.tiers.map((tier, i) => (
                <div key={i} className="tierrow">
                  <span className="tierrow__label" style={{ background: tierColor(i, state.table.tiers.length) }}>
                    {tier.name}
                  </span>
                  <ul className="tierrow__items" aria-label={tier.name}>
                    {tier.items.map((id) => {
                      const m = media.get(id)
                      const name = nameOf(id)
                      const fallback = <span className="tiertile__text">{name ?? ''}</span>
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className="tiertile"
                            aria-label={name ?? t('読み込み中の作品', 'Loading')}
                            aria-haspopup="dialog"
                            title={name ?? undefined}
                            onClick={() => m && setPicked(id)}
                          >
                            {m?.cover ? <CoverImage cover={m.cover} size="thumb" lazy fallback={fallback} /> : fallback}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
              <p className="tierboard__mark">Anipair</p>
            </div>
            {partial && <p className="note">{t('一部の作品の題名と表紙を出せませんでした。しばらくしてから開き直してください。', 'Some titles and covers couldn’t be loaded. Try reopening the page later.')}</p>}
            <p className="note sharedtier__about">
              {t('Anipairの利用者が作ったTier表です。作品の情報と表紙はShikimoriから取得しています。', 'This tier list was made by an Anipair user. Anime info and covers come from Shikimori.')}
            </p>
          </>
        )}
        <a className="btn btn--primary sharedtier__cta" href="/">
          {t('自分のTier表を作る（Annictでログイン）', 'Make your own tier list (log in with Annict)')}
        </a>
        <p className="sharedtier__links">
          <a href="/terms.html">{t('利用規約', 'Terms')}</a>
          <a href="/privacy.html">{t('プライバシーポリシー', 'Privacy')}</a>
        </p>
      </main>
      {pickedMedia && <SharedWorkCard media={pickedMedia} onClose={() => setPicked(null)} />}
    </div>
  )
}
