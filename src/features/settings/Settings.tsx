import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { HeadActions } from '../../components/ControlCenter'
import { BackIcon, BoxIcon, InfoIcon, KeyIcon, PaletteIcon, UserIcon } from '../../components/Icons'
import { annictClientId } from '../../lib/annictLogin'
import type { GithubConnection } from '../../lib/github'
import { rememberScroll, restoreScroll } from '../../lib/pageScroll'
import { useWide } from '../../lib/useWide'
import { useSwipeIntercept } from '../../lib/useSwipeNav'
import { AboutBlock } from './AboutBlock'
import { AccountBlock } from './AccountBlock'
import { BackupBlock } from './BackupBlock'
import { ButtonLabelsBlock } from './ButtonLabelsBlock'
import { ThemeBlock } from './ThemeBlock'
import { EffectsBlock } from './EffectsBlock'
import { GithubBlock } from './GithubBlock'
import { Keybinds } from './Keybinds'
import { Welcome } from './Welcome'
import { reducedMotion } from '../../lib/theme'

// 設定のまとまり。スマホは一覧を挟み（押すと開く）、PC は右端の縦の列で切り替える（記録と同じ形）。
// sections: 中の欄の id（コントロールセンターの近道などが、欄の id で開く先を指す）
type GroupId = 'account' | 'display' | 'backup' | 'keys' | 'about'

const GROUPS: readonly { id: GroupId; label: string; sub: string; icon: ReactNode; sections: readonly string[] }[] = [
  { id: 'account', label: 'アカウント', sub: 'Annict と GitHub の連携', icon: <UserIcon />, sections: ['settings-account', 'settings-github'] },
  { id: 'display', label: '表示', sub: 'テーマの色・明るさ・片手操作・ボタン・演出', icon: <PaletteIcon />, sections: ['settings-theme', 'settings-buttons', 'settings-effects'] },
  { id: 'backup', label: 'バックアップ', sub: 'ファイルに書き出す・毎日のバックアップ', icon: <BoxIcon />, sections: ['settings-backup'] },
  { id: 'keys', label: 'キー', sub: 'PC で答えるキーの割り当て', icon: <KeyIcon />, sections: ['settings-keys'] },
  { id: 'about', label: 'このアプリ', sub: '非公式であること・データの行き先・規約', icon: <InfoIcon />, sections: ['settings-about'] },
]

const groupOf = (section: string): GroupId | null => GROUPS.find((g) => g.sections.includes(section))?.id ?? null

// キーボードを使う端末か（マウスなど細かく指せるものがあるか）。指だけの端末（スマホ）には、キーの割り当ては出さない
function hasKeyboardLikely(): boolean {
  return typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: fine)').matches
}

// 画面の外から開く欄（コントロールセンターの近道など）。n は同じ欄をもう一度開くときにも効かせるための通し番号
export type SettingsRequest = { section: string; n: number }

export function Settings(props: {
  annictToken: string | null
  github: GithubConnection | null
  onAnnictTokenChange: (token: string | null, opts?: { forget?: boolean }) => void
  onGithubChange: (github: GithubConnection | null) => void
  // 「Annict でログイン」から戻ってきて、受け取っている最中か・失敗したときの文言
  loginBusy?: boolean
  loginError?: string | null
  // 指定が無ければビルドに埋め込まれた client_id を使う（無ければログインのボタンを出さない）
  clientId?: string | null
  // 開く欄（無ければ、スマホは一覧、PC はアカウント）
  request?: SettingsRequest | null
  active?: boolean
}) {
  // ログインする前は、最初の画面として説明とログインだけを出す（GitHub やキーバインドは、使い始めてからでよい）
  if (!props.annictToken) {
    return (
      <section className="settings settings--welcome">
        <Welcome
          clientId={props.clientId === undefined ? annictClientId() : props.clientId}
          busy={props.loginBusy ?? false}
          error={props.loginError ?? null}
          onAnnictTokenChange={props.onAnnictTokenChange}
        />
        <AboutBlock showTagline={false} welcome />
      </section>
    )
  }
  return <SignedInSettings {...props} annictToken={props.annictToken} />
}

function SignedInSettings(props: {
  annictToken: string
  github: GithubConnection | null
  onAnnictTokenChange: (token: string | null, opts?: { forget?: boolean }) => void
  onGithubChange: (github: GithubConnection | null) => void
  request?: SettingsRequest | null
  active?: boolean
}) {
  const wide = useWide()
  const request = props.request ?? null
  const [groups] = useState(() => (hasKeyboardLikely() ? GROUPS : GROUPS.filter((g) => g.id !== 'keys')))
  // 開いているまとまり（スマホで null なら一覧）
  const [picked, setPicked] = useState<GroupId | null>(null)
  const group: GroupId | null = picked ?? (wide ? 'account' : null)
  const current = groups.find((g) => g.id === group) ?? null

  // 項目を替える。流した位置はまとまりごとに覚えて戻し、中身は替えた向きから入る（スマホは横、PC は縦）
  const bodyRef = useRef<HTMLDivElement>(null)
  const slide = useRef<'next' | 'prev' | null>(null)
  const index = (g: GroupId | null) => (g === null ? -1 : groups.findIndex((x) => x.id === g))
  const select = (next: GroupId | null) => {
    if (next === group) return
    rememberScroll(`settings:${group ?? 'list'}`)
    slide.current = index(next) > index(group) ? 'next' : 'prev'
    setPicked(next)
  }
  // 近道から欄を頼まれたら、そのまとまりを開いて（描いたあとに）欄へ送る
  const [handled, setHandled] = useState<SettingsRequest | null>(null)
  if (request && request !== handled) {
    setHandled(request)
    const next = groupOf(request.section)
    if (next) setPicked(next)
  }
  const sentTo = useRef<SettingsRequest | null>(null)

  useLayoutEffect(() => {
    if (handled && sentTo.current !== handled) {
      sentTo.current = handled
      document.getElementById(handled.section)?.scrollIntoView?.({ block: 'start' })
      return
    }
    if (props.active !== false) restoreScroll(`settings:${group ?? 'list'}`)
    const dir = slide.current
    slide.current = null
    const el = bodyRef.current
    if (!dir || !el || typeof el.animate !== 'function' || reducedMotion()) return
    const sign = dir === 'next' ? 1 : -1
    el.animate([{ opacity: 0, transform: wide ? `translateY(${sign * 16}%)` : `translateX(${sign * 24}%)` }, { opacity: 1, transform: 'none' }], {
      duration: wide ? 320 : 280,
      easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)',
    })
    // まとまりを替えたとき・欄を頼まれたときだけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, handled])

  // スマホでまとまりを開いているときは、左へ払うと一覧に戻る
  useSwipeIntercept((dir) => {
    if (wide || group === null || dir !== 'prev') return false
    select(null)
    return true
  }, props.active !== false)

  return (
    <section className="settings settings--groups">
      <h1 className="visually-hidden">設定</h1>
      {wide && (
        <nav className="rrail" aria-label="設定の項目">
          {groups.map((g) => (
            <button key={g.id} type="button" className="rrail__item" aria-current={group === g.id ? 'true' : undefined} onClick={() => select(g.id)}>
              {g.icon}
              <span>{g.label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="settings__body" ref={bodyRef}>
        <header className="rhead">
          {!wide && current && (
            <button type="button" className="rhead__back" onClick={() => select(null)}>
              <BackIcon />
              設定
            </button>
          )}
          <h2 className="rhead__title">{current ? current.label : '設定'}</h2>
          <span className="rhead__actions">
            <HeadActions topic="settings" active={props.active} />
          </span>
        </header>
        {current === null ? (
          <ul className="folders">
            {groups.map((g) => (
              <li key={g.id}>
                <button type="button" className="folder" onClick={() => select(g.id)}>
                  {g.icon}
                  <b>{g.label}</b>
                  <small>{g.sub}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="settings__group">
            {current.id === 'account' && (
              <>
                <AccountBlock token={props.annictToken} onChange={props.onAnnictTokenChange} />
                <GithubBlock github={props.github} onChange={props.onGithubChange} />
              </>
            )}
            {current.id === 'display' && (
              <>
                <ThemeBlock />
                <ButtonLabelsBlock />
                <EffectsBlock />
              </>
            )}
            {current.id === 'backup' && <BackupBlock annictToken={props.annictToken} github={props.github} />}
            {current.id === 'keys' && <Keybinds />}
            {current.id === 'about' && <AboutBlock />}
          </div>
        )}
      </div>
    </section>
  )
}

