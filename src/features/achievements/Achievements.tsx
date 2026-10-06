import { useEffect, useMemo, useState } from 'react'
import { Empty } from '../../components/Empty'
import { SEASON_NAMES, seasonNameLabel, toSlug } from '../../lib/season'
import type { RecordRow } from '../records/recordList'
import { loadTitlesState, saveTitlesState, type TitlesState } from './achievementStore'
import { Awakening } from './Awakening'
import { TitlePlate } from './TitlePlate'
import { HIDDEN_COUNT, RARITIES, type Coverage, type Title } from './titles'
import { profileShare, type ShareCard } from '../share/shareCard'
import { ShareSheet } from '../share/ShareSheet'
import { useAchievements } from './useAchievements'
import { Elapsed } from '../../components/Loading'

// 記録タブの「実績」。称号の一覧・クールの紋章・隠し称号。方針は docs/concept.md「進み具合と称号」。
// 初めて開いたときは、材料（記録・Annict の数値・クールの一覧）がそろうのを待って、解放された称号を「覚醒」でまとめて見せる
export function Achievements(props: { token: string; rows: RecordRow[] | null; loadError: string | null; onReload: () => void; active: boolean }) {
  const a = useAchievements(props.token, props.rows, props.active)
  const [state, setState] = useState<TitlesState>(() => loadTitlesState())
  // 開いた時点で見たことのある称号。これに無い解放済みの称号に NEW を付ける（この画面を開いているあいだは付けたまま）
  const [seenAtOpen] = useState(() => new Set(state.seen))
  // God モード: すべての称号を手に入れた状態で並べる試し表示（デザインの確認用。本番のビルドでは出さない。何も保存しない）
  const [god, setGod] = useState(false)
  const [godEquipped, setGodEquipped] = useState<string | null>(null)
  const [godAwaken, setGodAwaken] = useState(false)
  // 共有する画像の中身（押したときに決める）
  const [shareCard, setShareCard] = useState<ShareCard | null>(null)

  const unlocked = useMemo(() => (a.titles ?? []).filter((t) => t.unlocked), [a.titles])
  // 端末の最新の内容に重ねて保存する（画面を開いたときの内容に重ねると、そのあと別の所で書いた「見た」などを古い内容で消してしまう。
  // 2026-10-06 の点検: 称号を掲げると、見終えた称号に NEW が戻っていた）
  const update = (patch: Partial<TitlesState>) => {
    const next = { ...loadTitlesState(), ...patch }
    setState(next)
    saveTitlesState(next)
  }

  // 覚醒のあとは、いま解放されているものを「見た」にする（次に開いたときは NEW を付けない）
  const unlockedKey = unlocked.map((t) => t.id).join(',')
  useEffect(() => {
    if (!a.ready || !state.awakened || !unlockedKey) return
    const current = loadTitlesState()
    const seen = new Set(current.seen)
    const ids = unlockedKey.split(',')
    if (ids.every((id) => seen.has(id))) return
    saveTitlesState({ ...current, seen: [...new Set([...current.seen, ...ids])] })
  }, [a.ready, state.awakened, unlockedKey])

  // 掲げている称号の名前とレア度を控えに書く（傾向の共有の画像で使う。掲げたのが前の版で、名前が無いときも埋める）
  const equippedNow = unlocked.find((t) => t.id === state.equipped) ?? null
  useEffect(() => {
    if (!equippedNow) return
    const current = loadTitlesState()
    if (current.equipped !== equippedNow.id || (current.equippedName === equippedNow.name && current.equippedRarity === equippedNow.rarity)) return
    const next = { ...current, equippedName: equippedNow.name, equippedRarity: equippedNow.rarity }
    saveTitlesState(next)
  }, [equippedNow])

  if (props.loadError) {
    return (
      <Empty title="記録を読み込めませんでした" body={props.loadError}>
        <button type="button" className="btn" onClick={props.onReload}>
          もう一度読み込む
        </button>
      </Empty>
    )
  }

  // 初めては、材料がそろうまで「読み解いています」を出す（そろってから覚醒で見せる）
  if (!state.awakened && !a.ready) {
    return (
      <div className="awaken-wait" aria-busy>
        <span className="awaken-wait__sigil" aria-hidden />
        <p className="awaken-wait__title">Annict での歩みを読み解いています</p>
        <p className="awaken-wait__note">
          {a.scan ? `クールの記録を照らし合わせています（${a.scan.done} / ${a.scan.total}）` : 'あなたの記録を整理しています'}
          <Elapsed />
        </p>
      </div>
    )
  }

  const titles = god ? (a.titles ?? []).map((t) => ({ ...t, unlocked: true, progress: null })) : (a.titles ?? [])
  const equippedId = god ? godEquipped : state.equipped
  const equipped = titles.find((t) => t.id === equippedId && t.unlocked) ?? null
  const toggleEquip = (t: Title) => {
    if (god) setGodEquipped((cur) => (cur === t.id ? null : t.id))
    else if (state.equipped === t.id) update({ equipped: null, equippedName: null, equippedRarity: null })
    else update({ equipped: t.id, equippedName: t.name, equippedRarity: t.rarity })
  }
  const isNew = (t: Title) => !god && t.unlocked && state.awakened && !seenAtOpen.has(t.id)
  const hidden = titles.filter((t) => t.group === 'hidden')
  const hiddenUnlocked = hidden.filter((t) => t.unlocked)
  const visibleCount = titles.filter((t) => !t.hidden)
  // 特別な称号は、手に入れた人にだけ見せる（数にも入れない）
  const special = titles.filter((t) => t.group === 'special' && t.unlocked)

  return (
    <div className="achievements">
      {god && (
        <div className="godbar" role="status">
          <p className="godbar__text">God モード: すべての称号を手に入れた状態で並べています。何も保存しません。</p>
          <div className="godbar__actions">
            <button type="button" className="btn" onClick={() => setGodAwaken(true)}>
              覚醒をもう一度見る
            </button>
            <button type="button" className="btn" onClick={() => setGod(false)}>
              やめる
            </button>
          </div>
        </div>
      )}
      <section className={equipped ? `profile rarity--${equipped.rarity}` : 'profile'} aria-label="プロフィール">
        {/* Annict の初期の画像（no-image）は出さない */}
        {a.stats?.avatarUrl && !a.stats.avatarUrl.includes('no-image') && <img className="profile__avatar" src={a.stats.avatarUrl} alt="" width={56} height={56} />}
        <div className="profile__body">
          <p className="profile__name">{a.stats ? a.stats.name || a.stats.username : 'あなた'}</p>
          {equipped ? (
            <p className="profile__title">
              <TitlePlate name={equipped.name} rarity={equipped.rarity} size="lg" />
            </p>
          ) : (
            <p className="profile__empty">手に入れた称号を選ぶと、ここに掲げられます</p>
          )}
          <p className="profile__count">
            <span>
              称号 {visibleCount.filter((t) => t.unlocked).length} / {visibleCount.length}
            </span>
            <span>
              隠し称号 {hiddenUnlocked.length} / {HIDDEN_COUNT}
            </span>
          </p>
          {!god && unlocked.length > 0 && (
            <button
              type="button"
              className="link profile__share"
              onClick={() =>
                setShareCard(
                  profileShare({
                    title: equipped ? { name: equipped.name, rarity: equipped.rarity } : null,
                    unlocked: visibleCount.filter((t) => t.unlocked).length,
                    total: visibleCount.length,
                    hiddenUnlocked: hiddenUnlocked.length,
                    hiddenTotal: HIDDEN_COUNT,
                    best: [...unlocked].sort((x, y) => RARITIES.indexOf(y.rarity) - RARITIES.indexOf(x.rarity)),
                  }),
                )
              }
            >
              称号を画像で共有
            </button>
          )}
        </div>
      </section>

      {a.scan && (
        <p className="note">
          クールの記録を照らし合わせています（{a.scan.done} / {a.scan.total}）
        </p>
      )}

      {shareCard && <ShareSheet card={shareCard} filename="anipair-titles.png" active={props.active} onClose={() => setShareCard(null)} />}

      <TitleSection heading="特別な称号" titles={special} equipped={equippedId} isNew={isNew} onEquip={toggleEquip} />
      <TitleSection heading="踏破の称号" titles={titles.filter((t) => t.group === 'season')} equipped={equippedId} isNew={isNew} onEquip={toggleEquip} />
      <TitleSection heading="見た作品の称号" titles={titles.filter((t) => t.group === 'watched')} equipped={equippedId} isNew={isNew} onEquip={toggleEquip} />
      <TitleSection heading="年と年代の称号" titles={titles.filter((t) => t.group === 'year' || t.group === 'decade')} equipped={equippedId} isNew={isNew} onEquip={toggleEquip} />

      {a.coverage && <SeasonCrest coverage={a.coverage} />}

      <section className="titles">
        <h2 className="titles__heading">
          隠し称号 <span className="titles__count">{hiddenUnlocked.length} / {HIDDEN_COUNT}</span>
        </h2>
        {hiddenUnlocked.length > 0 && (
          <ul className="titles__list">
            {hiddenUnlocked.map((t) => (
              <TitleCard key={t.id} title={t} equipped={equippedId === t.id} isNew={isNew(t)} onEquip={() => toggleEquip(t)} />
            ))}
          </ul>
        )}
        {hiddenUnlocked.length < HIDDEN_COUNT && (
          <ul className="titles__list titles__list--sealed">
            {Array.from({ length: HIDDEN_COUNT - hiddenUnlocked.length }, (_, i) => (
              <li key={`sealed-${i}`} className="title title--sealed" aria-label="まだ解放されていない隠し称号">
                <span className="title__name">？？？</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {__GOD_MODE__ && !god && (
        <button type="button" className="godbutton" onClick={() => setGod(true)}>
          God モード（すべての称号を試しに見る）
        </button>
      )}

      {god && godAwaken && <Awakening titles={titles} onClose={() => setGodAwaken(false)} />}

      {!state.awakened && a.ready && (
        <Awakening
          titles={unlocked}
          onClose={() => update({ awakened: true, seen: [...new Set([...loadTitlesState().seen, ...unlocked.map((t) => t.id)])] })}
        />
      )}
    </div>
  )
}

function TitleSection(props: { heading: string; titles: Title[]; equipped: string | null; isNew: (t: Title) => boolean; onEquip: (t: Title) => void }) {
  if (props.titles.length === 0) return null
  // 手に入れたものを先に
  const ordered = [...props.titles.filter((t) => t.unlocked), ...props.titles.filter((t) => !t.unlocked)]
  return (
    <section className="titles">
      <h2 className="titles__heading">{props.heading}</h2>
      <ul className="titles__list">
        {ordered.map((t) => (
          <TitleCard key={t.id} title={t} equipped={props.equipped === t.id} isNew={props.isNew(t)} onEquip={() => props.onEquip(t)} />
        ))}
      </ul>
    </section>
  )
}

// 1つの称号。名札と条件。手に入れたものは押すと掲げる（もう一度押すと外す）。まだのものは灰色の名札と進み具合を見せる
function TitleCard(props: { title: Title; equipped: boolean; isNew: boolean; onEquip: () => void }) {
  const t = props.title
  const body = (
    <>
      <TitlePlate name={t.name} rarity={t.rarity} locked={!t.unlocked} />
      {/* 位置は CSS で左上。読み上げでは称号の名前を先にする */}
      {props.isNew && <span className="title__new">NEW</span>}
      <span className="title__condition">{t.condition}</span>
      {!t.unlocked && t.progress && (
        <span className="title__progress">
          <span className="title__bar" aria-hidden>
            <span style={{ transform: `scaleX(${t.progress.goal > 0 ? t.progress.value / t.progress.goal : 0})` }} />
          </span>
          {t.progress.unit === '%' ? `${t.progress.value}% / ${t.progress.goal}%` : `${t.progress.value} / ${t.progress.goal} ${t.progress.unit}`}
        </span>
      )}
      {props.equipped && <span className="title__equipped">掲げている</span>}
    </>
  )
  if (!t.unlocked) return <li className="title title--locked">{body}</li>
  return (
    <li>
      <button type="button" className={`title title--unlocked rarity--${t.rarity}`} aria-pressed={props.equipped} onClick={props.onEquip}>
        {body}
      </button>
    </li>
  )
}

// クールの紋章: 年ごとの4クールの答えた割合を、色の濃さで並べる（新しい年を上に。答えのある年から）
const CREST_YEARS = 12

function SeasonCrest({ coverage }: { coverage: Map<string, Coverage> }) {
  const [all, setAll] = useState(false)
  const years = useMemo(() => {
    const touched = [...coverage].filter(([, c]) => c.answered > 0).map(([slug]) => Number(slug.slice(0, 4)))
    const now = new Date().getFullYear()
    const oldest = Math.min(now, ...touched)
    const out: number[] = []
    for (let y = now; y >= oldest; y--) out.push(y)
    return out
  }, [coverage])
  const shown = all ? years : years.slice(0, CREST_YEARS)
  return (
    <section className="titles">
      <h2 className="titles__heading">クールの紋章</h2>
      <p className="titles__lead">クールごとに、人気作のうち答えた割合。すべて答えると金に輝きます。</p>
      <div className="crest" role="table" aria-label="クールの紋章">
        <div className="crest__row crest__row--head" role="row">
          <span role="columnheader" />
          {SEASON_NAMES.map((n) => (
            <span key={n} role="columnheader" className="crest__season">
              {seasonNameLabel(n)}
            </span>
          ))}
        </div>
        {shown.map((year) => (
          <div key={year} className="crest__row" role="row">
            <span role="rowheader" className="crest__year">
              {year}
            </span>
            {SEASON_NAMES.map((name) => {
              const c = coverage.get(toSlug({ year, name }))
              const ratio = c && c.total > 0 ? c.answered / c.total : 0
              const tier = !c ? 'none' : ratio >= 1 ? 'full' : ratio >= 0.8 ? 'high' : ratio >= 0.5 ? 'mid' : ratio > 0 ? 'low' : 'zero'
              return (
                <span
                  key={name}
                  role="cell"
                  className={`crest__cell crest__cell--${tier}`}
                  aria-label={c ? `${year}年${seasonNameLabel(name)}: ${c.answered} / ${c.total}` : `${year}年${seasonNameLabel(name)}: まだ読んでいません`}
                  title={c ? `${c.answered} / ${c.total}` : undefined}
                />
              )
            })}
          </div>
        ))}
      </div>
      {years.length > CREST_YEARS && (
        <button type="button" className="link" onClick={() => setAll((v) => !v)}>
          {all ? '最近の年だけにする' : `${years[years.length - 1]}年まですべて見る`}
        </button>
      )}
    </section>
  )
}
