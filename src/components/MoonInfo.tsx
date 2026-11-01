import { useEffect, useId, useRef, useState } from 'react'
import { t, tx } from '../lib/i18n'
import { guessPlace, moonName, moonPass, moonPhase } from '../lib/moon'

// 右上の月の絵（base.css の --ground-moon）。何の絵か分かるよう、PC はマウスを載せると、スマホは押すと、今日の月の説明を出す。
// 広い画面は上の帯の中（bar）、スマホは見出しの右の空いた所（ground。出す画面は base.css が決める）
export function MoonInfo(props: { where: 'bar' | 'ground' }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const id = useId()
  const open = hover || pinned

  // 押して開いたときは、外を押すか Esc で閉じる
  useEffect(() => {
    if (!pinned) return
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setPinned(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [pinned])

  return (
    <span
      ref={box}
      className={`moon moon--${props.where}${open ? ' moon--open' : ''}`}
      // マウスだけ。タッチの指はホバーの扱いにしない（押したときに開いて閉じられなくなる）
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        type="button"
        className="moon__btn"
        aria-label={t('今日の月', "Today's moon")}
        aria-expanded={open}
        aria-controls={id}
        // 押すと開いたままにする（もう一度押すと戻す）。マウスを載せて開いているあいだは、離すまで開いたまま
        onClick={() => setPinned((p) => !p)}
      />
      {open && <MoonCard id={id} />}
    </span>
  )
}

function MoonCard(props: { id: string }) {
  const now = new Date()
  const phase = moonPhase(now)
  const name = moonName(phase.age)
  const place = guessPlace(now)
  const pass = moonPass(now, place)
  const rows: [string, Date | null][] = [
    [t('月の出', 'Moonrise'), pass.rise],
    [t('南中（いちばん高い）', 'Highest'), pass.transit],
    [t('月の入り', 'Moonset'), pass.set],
  ]
  return (
    <div className="moon__card" id={props.id} role="group" aria-label={t('今日の月', "Today's moon")}>
      <p className="moon__name">
        {tx(name.name)}
        {name.reading && tx(name.reading) && <small>{t(`（${tx(name.reading)}）`, ` (${tx(name.reading)})`)}</small>}
      </p>
      {name.note && <p className="moon__note">{tx(name.note)}</p>}
      <dl className="moon__facts">
        <dt>{t('月齢', 'Moon age')}</dt>
        <dd>{phase.age.toFixed(1)}</dd>
        {rows.map(([label, at]) => (
          <MoonRow key={label} label={label} at={at} now={now} />
        ))}
      </dl>
      <p className="moon__where">{place.tokyo ? t('時刻は東京での目安です。', 'Approximate times for Tokyo.') : t('時刻は、端末の時間帯から見積もった目安です。', "Approximate times for your device's time zone.")}</p>
    </div>
  )
}

function MoonRow(props: { label: string; at: Date | null; now: Date }) {
  const { at, now } = props
  let text = t('なし', 'None')
  if (at) {
    const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000)
    const time = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`
    text = days === 0 ? t(`${time}ごろ`, `about ${time}`) : days < 0 ? t(`昨日 ${time}ごろ`, `yesterday ${time}`) : t(`明日 ${time}ごろ`, `tomorrow ${time}`)
  }
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{text}</dd>
    </>
  )
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
