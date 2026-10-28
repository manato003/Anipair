import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Sheet } from '../../components/Sheet'
import { getLang, t } from '../../lib/i18n'
import { reducedMotion } from '../../lib/theme'
import { briefOf, dateRange, loadHistory, versionRange, type ChangeBlock, type ChangeEntry, type Milestone } from './historyData'
import { HistoryArt } from './HistoryArt'
import { markHistorySeen } from './historySeen'

// 「開発記録」の1枚。一番上に最新の版の短いまとめ（全部は「詳しく見る」で節目を開いて読む）、その下に節目を新しい順に並べ、下へ送るほど昔へさかのぼる。
// 節目を押すと、その節目の版の項目を1枚で開く（作品の詳細と同じ、寄って開く動き）。
// 左の細い列の横棒は節目の数だけ並び、いま見ている節目の棒を長く濃くする（上と下にあといくつあるかが分かる。押すとその節目へ送る）

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'ja-JP', opts)
const shortDate = (iso: string) => fmt(iso, { month: 'short', day: 'numeric' })
const longDate = (iso: string) => fmt(iso, { year: 'numeric', month: 'long', day: 'numeric' })
const RANGE = () => t('〜', '–')

// `tiers.json` のような書き方だけを、コードの見た目にする
function inline(text: string): ReactNode {
  const parts = text.split('`')
  return parts.map((p, i) => (i % 2 === 1 ? <code key={i}>{p}</code> : p))
}

// 版の中身。段落・小見出し・箇条書き（1段下げた箇条書きは、直前の項目の下に入れる）
export function ChangeBlocks({ blocks }: { blocks: ChangeBlock[] }) {
  const out: ReactNode[] = []
  let items: { text: string; sub: string[] }[] = []
  const flush = () => {
    if (items.length === 0) return
    out.push(
      <ul key={out.length} className="history__items">
        {items.map((it, i) => (
          <li key={i}>
            {inline(it.text)}
            {it.sub.length > 0 && (
              <ul>
                {it.sub.map((s, j) => (
                  <li key={j}>{inline(s)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>,
    )
    items = []
  }
  for (const b of blocks) {
    if (b.kind === 'li') {
      const last = items[items.length - 1]
      if (b.depth === 1 && last) last.sub.push(b.text)
      else items.push({ text: b.text, sub: [] })
      continue
    }
    flush()
    out.push(
      b.kind === 'h' ? (
        <h4 key={out.length} className="history__subhead">
          {inline(b.text)}
        </h4>
      ) : (
        <p key={out.length} className="history__lead">
          {inline(b.text)}
        </p>
      ),
    )
  }
  flush()
  return <>{out}</>
}

function Brief({ entry }: { entry: ChangeEntry }) {
  const brief = briefOf(entry)
  if (brief.kind === 'lead') return <p className="history__lead">{inline(brief.text)}</p>
  return (
    <ul className="history__items">
      {brief.items.map((text, i) => (
        <li key={i}>{inline(text)}</li>
      ))}
    </ul>
  )
}

function VersionHead({ entry }: { entry: ChangeEntry }) {
  return (
    <h3 className="history__version">
      <span>{entry.version}</span>
      <small>{longDate(entry.date)}</small>
    </h3>
  )
}

export default function History(props: { active?: boolean; onClose: () => void }) {
  const history = useMemo(() => loadHistory(), [])
  const [open, setOpen] = useState<Milestone | null>(null)
  const active = props.active !== false

  // 開いたら、新着の点を消す
  useEffect(() => markHistorySeen(), [])

  // いま見ている節目。リストの上から35%の高さを越えた最後の節目（いちばん下まで送ったら最後の節目）
  const listRef = useRef<HTMLOListElement>(null)
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    const list = listRef.current
    const scroller = list?.closest<HTMLElement>('.sheet')
    if (!list || !scroller) return
    let raf = 0
    const update = () => {
      raf = 0
      const items = Array.from(list.children) as HTMLElement[]
      const box = scroller.getBoundingClientRect()
      const line = box.top + scroller.clientHeight * 0.35
      let i = 0
      items.forEach((el, k) => {
        if (el.getBoundingClientRect().top <= line) i = k
      })
      if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) i = items.length - 1
      setCurrent(i)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  const goTo = (i: number) => {
    const el = listRef.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView?.({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }

  const { latest, milestones } = history
  const newest = milestones[0]
  return (
    <Sheet label={t('開発記録', 'Development history')} size="page" active={active && open === null} onClose={props.onClose}>
      <div className="history">
        <h2 className="history__title">{t('開発記録', 'Development history')}</h2>
        <p className="history__intro">
          {t('2026年10月2日に公開してから、これまでに変わってきたことです。新しいものから順に並べています。', 'What has changed since Anipair launched on October 2, 2026, newest first.')}
        </p>
        {latest && (
          <section className="history__latest" aria-label={t('最新の版', 'Latest version')}>
            <p className="history__latest-label">{t('最新の版', 'Latest version')}</p>
            <VersionHead entry={latest} />
            <Brief entry={latest} />
            {newest && (
              <button type="button" className="link history__more" onClick={() => setOpen(newest)}>
                {t('詳しく見る', 'See details')}
              </button>
            )}
          </section>
        )}
        <div className="history__body">
          <nav className="history__rail" aria-label={t('節目へ移る', 'Jump to a chapter')}>
            {milestones.map((m, i) => (
              <button
                key={m.n}
                type="button"
                className="history__bar"
                aria-label={m.title}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </nav>
          <ol className="history__list" ref={listRef}>
            {milestones.map((m) => (
              <li key={m.n}>
                <button type="button" className="history__item" onClick={() => setOpen(m)}>
                  <HistoryArt kind={m.art} />
                  <span className="history__text">
                    <span className="history__range">
                      {versionRange(m, RANGE())}
                      {m === newest && <span className="history__now">{t('最新', 'Latest')}</span>}
                    </span>
                    <b className="history__name">{m.title}</b>
                    <span className="history__dates">{dateRange(m, shortDate, RANGE())}</span>
                    <span className="history__summary">{m.summary}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {open && <MilestoneDetail milestone={open} active={active} onClose={() => setOpen(null)} />}
    </Sheet>
  )
}

function MilestoneDetail(props: { milestone: Milestone; active: boolean; onClose: () => void }) {
  const m = props.milestone
  return (
    <Sheet label={m.title} size="page" active={props.active} onClose={props.onClose}>
      <div className="history-detail">
        <HistoryArt kind={m.art} />
        <div>
          <p className="history__range">{versionRange(m, RANGE())}</p>
          <h2 className="history-detail__title">{m.title}</h2>
          <p className="history__dates">{dateRange(m, shortDate, RANGE())}</p>
          <p className="history-detail__summary">{m.summary}</p>
          {m.entries.map((e) => (
            <section key={e.version} className="history-detail__version">
              <VersionHead entry={e} />
              <ChangeBlocks blocks={e.blocks} />
            </section>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
