import { useEffect, useState } from 'react'
import { CoverImage } from '../../components/CoverImage'
import { Sheet } from '../../components/Sheet'
import { t } from '../../lib/i18n'
import { workTitle } from '../../lib/names'
import type { RecordRow } from '../records/recordList'
import { aboutLeft, answerCompare, applyCompare, nextPair, resetCompare, startCompare, type CompareState } from './tierRanking'
import { restorePlacement, tierColor, type TierTable, type TierView } from './tierList'

// 比べる相手を左に出すか（毎回ばらばら）
const coin = () => Math.random() < 0.5

// 先に読み込んだ表紙（同じ画像を何度も読みに行かない）
const preloaded = new Set<string>()
function preload(url: string) {
  if (preloaded.has(url)) return
  preloaded.add(url)
  const img = new Image()
  img.src = url
  img.decode?.().catch(() => {})
}

// 比べている途中の1本の幅（中断して開き直したとき、決めかけの1本の答えも続きから使う）。端末を読み込み直すと消え、決め終えた分だけが表に残る
const paused = new Map<string, CompareState>()
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id, i) => id === b[i])

// 次に出るかもしれない組（どちらを選んでも、その次も）の作品。答えた後に表紙を読み始めると、出るまでに間があく
function upcoming(s: CompareState, depth = 2): number[] {
  if (depth === 0) return []
  return [true, false].flatMap((higher) => {
    const next = answerCompare(s, higher)
    const pair = nextPair(next)
    return pair ? [pair.candidate, pair.against, ...upcoming(next, depth - 1)] : []
  })
}

// 段の中の順番を、2つずつ比べて決める。表紙が並んでいると並びに引っぱられるので、2つだけを出して「どちらの方が好みですか？」と聞く（2026-11-01 利用者。「上にするのはどっち？」から変えた）。
// 左右の位置で選ばないよう、どちらを左に出すかは毎回ばらばら。「同じくらい」は出さない（2026-11-01 利用者）。
// 1本の位置が決まるたびに表へ書くので、途中で閉じても比べ終えた分は段の前に残り、次に開くと続きから比べる
export function TierCompare(props: { table: TierTable; view: TierView; active: boolean; onChange: (table: TierTable) => void; onClose: () => void }) {
  // 比べている段（null なら段を選んでいる）
  const [index, setIndex] = useState<number | null>(null)
  const [state, setState] = useState<CompareState | null>(null)
  // いまの組で、比べる相手を左に出す
  const [flip, setFlip] = useState(false)
  // 答える前の並びと表（新しい順に戻す）。表は位置が決まって書いたときだけ変わる
  const [history, setHistory] = useState<{ state: CompareState; table: TierTable; flip: boolean }[]>([])
  const count = props.view.tiers.length

  // 次の組の表紙を、答える前に読み込んでおく
  useEffect(() => {
    if (index === null || !state) return
    const rows = new Map(props.view.tiers[index]?.rows.map((r) => [r.entry.annictId, r]))
    for (const id of upcoming(state)) {
      const url = rows.get(id)?.cover?.url
      if (url) preload(url)
    }
  }, [index, state, props.view])

  const visibleOf = (i: number) => props.view.tiers[i].rows.map((r) => r.entry.annictId)
  const startOf = (i: number) => startCompare(visibleOf(i), props.table.tiers[i]?.ranked ?? [])
  const keyOf = (i: number) => `${props.table.id}:${i}`
  // 中断したときの幅が、いまの段の並びと合っていれば、そこから続ける
  const resumeOf = (i: number) => {
    const start = startOf(i)
    const saved = paused.get(keyOf(i))
    return saved && same(saved.ranked, start.ranked) && same(saved.rest, start.rest) ? saved : start
  }
  const open = (i: number) => {
    setIndex(i)
    setState(resumeOf(i))
    setFlip(coin())
    setHistory([])
  }

  if (index === null || !state || !props.view.tiers[index]) {
    return (
      <Sheet label={t('比べて並べる', 'Rank by comparing')} active={props.active} onClose={props.onClose}>
        <div className="tiercmp">
          <p className="note">
            {t(
              '段の中の順番を、2つずつ比べて決めます。比べ終えた作品は、その段の前から並びます。今の並びが合っているほど、少ない回数で済みます。途中でやめても、次は続きから比べられます。',
              'Decide the order inside a tier by comparing two anime at a time. Ranked anime go to the front of the tier. The closer the current order is to what you want, the fewer comparisons it takes. If you stop partway, you can pick up where you left off.',
            )}
          </p>
          <ul className="tiercmp__tiers">
            {props.view.tiers.map((tier, i) => {
              const s = startOf(i)
              const total = tier.rows.length
              const left = aboutLeft(s)
              const done = total >= 2 && left === 0
              const status =
                total < 2
                  ? t('比べる作品がありません', 'Nothing to compare')
                  : done
                    ? t('順番を決めました', 'Ranked')
                    : s.ranked.length >= 2
                      ? t(`続きから・あと約 ${left} 回`, `Continue · about ${left} more`)
                      : t(`約 ${left} 回`, `About ${left} comparisons`)
              return (
                <li key={i} className="tiercmp__row">
                  <button type="button" className="tiercmp__tier" onClick={() => open(i)} disabled={total < 2 || done}>
                    <span className="tiercmp__label" style={{ background: tierColor(i, count) }}>
                      {tier.name}
                    </span>
                    <span className="tiercmp__count">{t(`${total}本`, `${total}`)}</span>
                    <span className="note tiercmp__status">{status}</span>
                  </button>
                  {done && (
                    <button type="button" className="link" onClick={() => props.onChange(resetCompare(props.table, i))}>
                      {t('最初から比べ直す', 'Start over')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </Sheet>
    )
  }

  const tierName = props.view.tiers[index].name
  const rows = new Map(props.view.tiers[index].rows.map((r) => [r.entry.annictId, r]))
  const pair = nextPair(state)
  const candidate = pair ? rows.get(pair.candidate) : undefined
  const against = pair ? rows.get(pair.against) : undefined

  const choose = (higher: boolean) => {
    const next = answerCompare(state, higher)
    setHistory((h) => [...h, { state, table: props.table, flip }])
    setState(next)
    paused.set(keyOf(index), next)
    setFlip(coin())
    if (next.rest.length < state.rest.length) props.onChange(applyCompare(props.table, index, next))
  }
  const undo = () => {
    const last = history.at(-1)
    if (!last) return
    setHistory((h) => h.slice(0, -1))
    setState(last.state)
    paused.set(keyOf(index), last.state)
    setFlip(last.flip)
    if (last.table !== props.table) props.onChange(restorePlacement(props.table, last.table))
  }
  const undoButton = (
    <button type="button" className="btn" onClick={undo} disabled={history.length === 0}>
      {t('ひとつ戻る', 'Undo')}
    </button>
  )
  // 比べている間は×を出さず、これで閉じる（×だと、ここまでの答えが消えると思われやすい）
  const pause = (
    <button type="button" className="btn" onClick={props.onClose}>
      {t('保存して中断', 'Save and pause')}
    </button>
  )
  const back = (
    <button type="button" className="btn" onClick={() => setIndex(null)}>
      {t('段を選ぶ', 'Choose a tier')}
    </button>
  )

  // 比べている間に段から作品が抜けた（ほかの端末で動かしたなど）ら、その段を選び直してもらう
  if (pair && (!candidate || !against)) {
    return (
      <Sheet label={t('比べて並べる', 'Rank by comparing')} active={props.active} onClose={props.onClose}>
        <div className="tiersort">
          <p className="note">{t('段の作品が変わりました。もう一度選んでください。', 'This tier has changed. Please choose it again.')}</p>
          <div className="tiersort__acts">{back}</div>
        </div>
      </Sheet>
    )
  }

  const next = props.view.tiers.findIndex((_, i) => i > index && startOf(i).rest.length > 0)
  const card = (row: RecordRow, higher: boolean) => (
    <button type="button" className="tiercmp__card" onClick={() => choose(higher)}>
      <span className="tiersort__cover tiercmp__cover">{row.cover ? <CoverImage key={row.entry.annictId} cover={row.cover} size="large" /> : <span className="tiertile__text">{workTitle(row.entry)}</span>}</span>
      <span className="tiersort__name">{workTitle(row.entry)}</span>
    </button>
  )

  return (
    <Sheet label={t('比べて並べる', 'Rank by comparing')} active={props.active} closeButton={!(candidate && against)} onClose={props.onClose}>
      {candidate && against ? (
        <div className="tiersort">
          <p className="tiercmp__question">{t('どちらの方が好みですか？', 'Which do you like more?')}</p>
          <p className="note">{t(`「${tierName}」の順番・あと約 ${aboutLeft(state)} 回`, `“${tierName}” · about ${aboutLeft(state)} more`)}</p>
          <div className="tiercmp__pair">
            {flip ? card(against, false) : card(candidate, true)}
            {flip ? card(candidate, true) : card(against, false)}
          </div>
          <div className="tiersort__acts">
            {undoButton}
            {back}
            {pause}
          </div>
          <p className="note">{t('中断しても、比べ終えた作品は表に残ります。次は続きから比べられます。', 'If you pause, the anime you’ve ranked stay in the list, and you can pick up where you left off.')}</p>
        </div>
      ) : (
        <div className="tiersort">
          <p className="tiersort__name">{t(`「${tierName}」の順番を決めました`, `“${tierName}” is ranked`)}</p>
          <div className="tiersort__acts">
            {undoButton}
            {back}
            {next >= 0 ? (
              <button type="button" className="btn btn--primary" onClick={() => open(next)}>
                {t(`次の段「${props.view.tiers[next].name}」へ`, `Next tier: “${props.view.tiers[next].name}”`)}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={props.onClose}>
                {t('表に戻る', 'Back to the list')}
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
