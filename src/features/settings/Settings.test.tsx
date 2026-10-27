// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAGLINE, TAGLINE_PHRASES_EN } from '../../lib/brand'
import { resetLangForTests } from '../../lib/i18n'
import { GitHubError, type GithubConnection } from '../../lib/github'

vi.mock('../backup/backupStore', async (orig) => ({
  ...(await orig<typeof import('../backup/backupStore')>()),
  runBackup: vi.fn(),
}))
vi.mock('../backup/exportFile', async (orig) => ({
  ...(await orig<typeof import('../backup/exportFile')>()),
  exportBackupFile: vi.fn(),
}))
// GitHub には触れない。連携するときの確認だけ偽物にする
vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  checkAccess: vi.fn(async () => undefined),
}))

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchViewer: vi.fn(async () => ({ name: 'テスト', username: 'tester' })),
}))
// ログインの画面遷移は偽物にする（実際には Annict へ移ってしまう）
vi.mock('../../lib/annictLogin', async (orig) => ({
  ...(await orig<typeof import('../../lib/annictLogin')>()),
  startLogin: vi.fn(),
}))

const { runBackup } = await import('../backup/backupStore')
const { startLogin } = await import('../../lib/annictLogin')
const { exportBackupFile } = await import('../backup/exportFile')
const { checkAccess } = await import('../../lib/github')
const { Settings } = await import('./Settings')

const counts = { watched: 60, wanna: 45, watching: 3, other: 2, rated: 58 }
const CONN: GithubConnection = { token: 'g', repo: 'me/anipair-data' }

const onGithubChange = vi.fn()
const onAnnictTokenChange = vi.fn()

// section: 開く欄（スマホの形では、まとまりを開くまで中の欄は出ない。コントロールセンターの近道と同じ渡し方で開く）
function show(
  over: { annictToken?: string | null; github?: GithubConnection | null; clientId?: string | null; loginBusy?: boolean; loginError?: string | null; section?: string } = {},
) {
  const { section, ...rest } = over
  const props = { annictToken: 'a', github: CONN, ...rest }
  return render(<Settings {...props} request={section ? { section, n: 1 } : null} onAnnictTokenChange={onAnnictTokenChange} onGithubChange={onGithubChange} />)
}

function store(status: object) {
  localStorage.setItem('animax.backup', JSON.stringify(status))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(cleanup)

describe('Settings backup block', () => {
  it('offers the file export and a line about automatic backups when GitHub is not connected', () => {
    show({ section: 'settings-backup', github: null })
    expect(screen.getByRole('heading', { level: 3, name: 'バックアップ' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ファイルに書き出す' })).toBeTruthy()
    expect(screen.getByText('GitHubと連携すると、毎日自動でバックアップします。')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '今すぐバックアップ' })).toBeNull()
    expect(screen.queryByText('GitHubで見る')).toBeNull()
    expect(screen.queryByText('変更履歴')).toBeNull()
  })

  it('explains where it is saved and that past versions stay in the history', () => {
    show({ section: 'settings-backup' })
    const text = screen.getByText(/backup\.jsonに自動で保存します/).textContent
    expect(text).toContain('me/anipair-data')
    expect(text).toContain('以前の内容はGitHubの変更履歴から確認できます')
  })

  it('says it has not run yet', () => {
    show({ section: 'settings-backup' })
    expect(screen.getByText('まだバックアップしていません')).toBeTruthy()
  })

  it('shows the last time, local time, with whether it was unchanged', () => {
    const at = new Date(2026, 9, 1, 21, 4)
    store({ lastAt: at.toISOString(), written: false, error: null })
    show({ section: 'settings-backup' })
    expect(screen.getByText('前回: 2026/10/1 21:04（変更なし）')).toBeTruthy()
  })

  it('shows the last time with 保存 when it wrote', () => {
    store({ lastAt: new Date(2026, 9, 1, 7, 5).toISOString(), written: true, error: null })
    show({ section: 'settings-backup' })
    expect(screen.getByText('前回: 2026/10/1 07:05（保存）')).toBeTruthy()
  })

  it('shows the last error', () => {
    store({ lastAt: null, written: false, error: 'GitHubに接続できませんでした。通信を確認してください' })
    show({ section: 'settings-backup' })
    expect(screen.getByText(/前回のバックアップに失敗しました: GitHubに接続できませんでした/)).toBeTruthy()
  })

  it('links to the file and its history in the configured repo', () => {
    show({ section: 'settings-backup', github: { token: 'g', repo: 'someone/their-data' } })
    expect((screen.getByRole('link', { name: 'GitHubで見る' }) as HTMLAnchorElement).href).toBe('https://github.com/someone/their-data/blob/main/backup.json')
    expect((screen.getByRole('link', { name: '変更履歴' }) as HTMLAnchorElement).href).toBe('https://github.com/someone/their-data/commits/main/backup.json')
  })

  it('backs up with the Annict token and the connection, showing the progress and the result', async () => {
    let finish!: (r: { written: boolean; at: string; counts: typeof counts }) => void
    vi.mocked(runBackup).mockReturnValue(new Promise((r) => (finish = r)))
    show({ section: 'settings-backup' })
    fireEvent.click(screen.getByRole('button', { name: '今すぐバックアップ' }))
    expect(runBackup).toHaveBeenCalledWith('a', CONN)
    const busy = screen.getByRole('button', { name: 'バックアップしています…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    finish({ written: true, at: '2026-10-01T12:00:00.000Z', counts })
    expect(await screen.findByText('バックアップしました（見た 60・見たい 45・評価 58）')).toBeTruthy()
    expect((screen.getByRole('button', { name: '今すぐバックアップ' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('says nothing was written when the content did not change', async () => {
    vi.mocked(runBackup).mockResolvedValue({ written: false, at: '2026-10-01T12:00:00.000Z', counts })
    show({ section: 'settings-backup' })
    fireEvent.click(screen.getByRole('button', { name: '今すぐバックアップ' }))
    expect(await screen.findByText('前回から変更がないため、保存しませんでした')).toBeTruthy()
  })

  it('shows the failure from the stored error and enables the button again', async () => {
    vi.mocked(runBackup).mockImplementation(async () => {
      store({ lastAt: null, written: false, error: 'Annictのトークンが使えません' })
      throw new Error('Annictのトークンが使えません')
    })
    show({ section: 'settings-backup' })
    fireEvent.click(screen.getByRole('button', { name: '今すぐバックアップ' }))
    expect(await screen.findByText(/前回のバックアップに失敗しました: Annictのトークンが使えません/)).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: '今すぐバックアップ' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/バックアップしました/)).toBeNull()
  })
})

describe('Settings GitHub block', () => {
  const formOf = () => screen.getByLabelText('GitHubのリポジトリ名').closest('form')!
  const connectButton = () => formOf().querySelector('button[type="submit"]') as HTMLButtonElement

  // 未連携のときは、「連携する」を押すと手順と入力欄が出る（#30）
  const openSetup = () => fireEvent.click(screen.getByRole('button', { name: '連携する' }))

  function fill(repo: string, token: string) {
    fireEvent.change(screen.getByLabelText('GitHubのリポジトリ名'), { target: { value: repo } })
    fireEvent.change(screen.getByLabelText('GitHubのFine-grainedトークン'), { target: { value: token } })
  }

  it('says what connecting adds, and that everything else works without it', () => {
    show({ section: 'settings-github', github: null })
    expect(screen.getByRole('heading', { name: 'GitHub連携（任意）' })).toBeTruthy()
    expect(screen.getByText('興味なし・見てないなどを、PCとスマホで共有して毎日バックアップします。')).toBeTruthy()
    // 手順と入力欄は、押すまで出ない
    expect(screen.queryByLabelText('GitHubのリポジトリ名')).toBeNull()
    expect(screen.queryByText('連携の手順（3ステップ）')).toBeNull()
  })

  it('not connected: shows the steps with links, and the form', () => {
    show({ section: 'settings-github', github: null })
    openSetup()
    expect((screen.getByRole('link', { name: 'リポジトリの作成画面を開く' }) as HTMLAnchorElement).href).toBe(
      'https://github.com/new?name=anipair-data&visibility=private',
    )
    expect((screen.getByRole('link', { name: 'トークンの作成画面を開く' }) as HTMLAnchorElement).href).toBe(
      'https://github.com/settings/personal-access-tokens/new',
    )
    expect(screen.getByText(/Contentsを「Read and write」/)).toBeTruthy()
    expect(screen.getByLabelText('GitHubのリポジトリ名')).toBeTruthy()
    expect(screen.getByLabelText('GitHubのFine-grainedトークン')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '連携を解除' })).toBeNull()
    // 作者の旧リポジトリ名はどこにも出ない
    expect(document.body.textContent).not.toContain('animax-data')
  })

  it('the connect button needs both fields', () => {
    show({ section: 'settings-github', github: null })
    openSetup()
    expect(connectButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('GitHubのリポジトリ名'), { target: { value: 'me/anipair-data' } })
    expect(connectButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('GitHubのFine-grainedトークン'), { target: { value: 'tok' } })
    expect(connectButton().disabled).toBe(false)
  })

  it('verifies with the repo and token first, then saves both and connects', async () => {
    show({ section: 'settings-github', github: null })
    openSetup()
    fill(' me/anipair-data ', ' tok ')
    fireEvent.submit(formOf())
    await waitFor(() => expect(onGithubChange).toHaveBeenCalledWith({ token: 'tok', repo: 'me/anipair-data' }))
    expect(checkAccess).toHaveBeenCalledWith({ token: 'tok', repo: 'me/anipair-data' })
    expect(localStorage.getItem('animax.githubToken')).toBe('tok')
    expect(localStorage.getItem('animax.githubRepo')).toBe('me/anipair-data')
    expect(await screen.findByText('me/anipair-dataと連携しました')).toBeTruthy()
  })

  it('on a verification failure shows the error and saves nothing', async () => {
    vi.mocked(checkAccess).mockRejectedValueOnce(new GitHubError('このトークンではme/anipair-dataが見えません。', 'auth'))
    show({ section: 'settings-github', github: null })
    openSetup()
    fill('me/anipair-data', 'tok')
    fireEvent.submit(formOf())
    expect(await screen.findByText(/このトークンではme\/anipair-dataが見えません/)).toBeTruthy()
    expect(onGithubChange).not.toHaveBeenCalled()
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    expect(localStorage.getItem('animax.githubRepo')).toBeNull()
    // 直して、もう一度試せる
    await waitFor(() => expect(connectButton().disabled).toBe(false))
  })

  it('rejects a malformed repository name without calling GitHub', () => {
    show({ section: 'settings-github', github: null })
    openSetup()
    fill('https://github.com/me/anipair-data', 'tok')
    fireEvent.submit(formOf())
    expect(screen.getByText(/リポジトリ名は「ユーザー名\/anipair-data」の形式で入力してください/)).toBeTruthy()
    expect(checkAccess).not.toHaveBeenCalled()
    expect(onGithubChange).not.toHaveBeenCalled()
  })

  it('connected: shows owner/name as a link and the disconnect button, without the form', () => {
    show({ section: 'settings-github' })
    expect((screen.getByRole('link', { name: 'me/anipair-data' }) as HTMLAnchorElement).href).toBe('https://github.com/me/anipair-data')
    expect(screen.getByRole('button', { name: '連携を解除' })).toBeTruthy()
    expect(screen.queryByLabelText('GitHubのリポジトリ名')).toBeNull()
    expect(screen.queryByLabelText('GitHubのFine-grainedトークン')).toBeNull()
  })

  it('disconnecting clears both the token and the repository', () => {
    localStorage.setItem('animax.githubToken', 'g')
    localStorage.setItem('animax.githubRepo', 'me/anipair-data')
    show({ section: 'settings-github' })
    fireEvent.click(screen.getByRole('button', { name: '連携を解除' }))
    expect(onGithubChange).toHaveBeenCalledWith(null)
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    expect(localStorage.getItem('animax.githubRepo')).toBeNull()
  })
})

describe('Settings file export', () => {
  const exportResult = { fileName: 'anipair-backup-2026-10-01.json', counts }

  it.each([
    ['connected', CONN],
    ['not connected', null],
  ])('is available when %s, with the progress and the result', async (_name, github) => {
    let finish!: (r: typeof exportResult) => void
    vi.mocked(exportBackupFile).mockReturnValue(new Promise((r) => (finish = r)))
    show({ section: 'settings-backup', github })
    fireEvent.click(screen.getByRole('button', { name: 'ファイルに書き出す' }))
    expect(exportBackupFile).toHaveBeenCalledWith('a')
    const busy = screen.getByRole('button', { name: '書き出しています…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    finish(exportResult)
    expect(await screen.findByText('anipair-backup-2026-10-01.jsonを保存しました（見た 60・見たい 45・評価 58）')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'ファイルに書き出す' }) as HTMLButtonElement).disabled).toBe(false)
    // GitHub のバックアップは動かさない
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('shows the error and enables the button again when it fails', async () => {
    vi.mocked(exportBackupFile).mockRejectedValue(new Error('Annictのトークンが使えません'))
    show({ section: 'settings-backup', github: null })
    fireEvent.click(screen.getByRole('button', { name: 'ファイルに書き出す' }))
    expect(await screen.findByText('Annictのトークンが使えません')).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: 'ファイルに書き出す' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/を保存しました/)).toBeNull()
  })
})

describe('Settings first screen (no Annict token)', () => {
  it('says what the app is, offers the login, and links to Annict sign-up', () => {
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.getByRole('heading', { name: 'Anipair' })).toBeTruthy()
    expect(screen.getByText(/タップだけで付けられるアプリです/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annictでログイン' })).toBeTruthy()
    expect(screen.getByText(/アカウントをお持ちでない方は/)).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Annictで新規登録' }) as HTMLAnchorElement).href).toBe('https://annict.com/sign_up')
  })

  // 「Annictでログイン」は Annict にログインしているアカウントでそのまま入る。ログアウトした端末にだけ、別のアカウントでの入り方を添える（2026-10-13）
  it('after a logout on this device, tells how to sign in with another Annict account (same window)', () => {
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.queryByText(/別のアカウントと連携するときは/)).toBeNull()
    cleanup()
    localStorage.setItem('animax.owner.v1', '!')
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.getByText(/先にAnnictのサイトでそのアカウントにログインしてください/)).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Annictを開く' }) as HTMLAnchorElement
    expect(link.href).toBe('https://annict.com/')
    expect(link.target).toBe('')
  })

  it('puts the logo and the tagline at the top of the welcome', () => {
    show({ annictToken: null, clientId: 'cid' })
    const heading = screen.getByRole('heading', { name: 'Anipair' })
    expect(heading.querySelector('svg.logo__mark')).toBeTruthy()
    // ロゴの次に、2人で並んでアニメを見ている絵、その次にキャッチコピー
    expect(heading.nextElementSibling?.getAttribute('aria-label')).toBe('アニとペアが並んでアニメを見ている')
    expect(heading.nextElementSibling?.nextElementSibling?.textContent).toBe(TAGLINE)
  })

  it('shows only the welcome and a folded 「このアプリについて」 (no GitHub, backup or keys yet)', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    const about = container.querySelector('details.welcome__about') as HTMLDetailsElement
    expect(about.open).toBe(false)
    expect(about.querySelector(':scope > summary')?.textContent).toBe('このアプリについて')
    expect(about.textContent).toContain('個人が開発した、Annictの非公式アプリです')
    expect(screen.queryByRole('heading', { name: 'GitHub連携（任意）' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'バックアップ' })).toBeNull()
  })

  it('starts the login with the client id and this origin', () => {
    show({ annictToken: null, clientId: 'cid' })
    fireEvent.click(screen.getByRole('button', { name: 'Annictでログイン' }))
    expect(startLogin).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'cid', origin: window.location.origin }))
  })

  it('shows the progress while the login is being received, with the button disabled', () => {
    show({ annictToken: null, clientId: 'cid', loginBusy: true })
    expect((screen.getByRole('button', { name: 'ログインしています…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a login error on the screen', () => {
    show({ annictToken: null, clientId: 'cid', loginError: 'ログインの確認に失敗しました。' })
    expect(screen.getByRole('alert').textContent).toBe('ログインの確認に失敗しました。')
  })

  it('folds the personal-token form under the developer heading, inside 「このアプリについて」, when the login is available', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    const details = container.querySelector('details.settings__dev') as HTMLDetailsElement
    expect(details.closest('details.welcome__about')).toBeTruthy()
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('開発者向け: 個人用アクセストークンで使う')
    expect(details.querySelector('input[type="password"]')).toBeTruthy()
  })

  it('without a client id there is no login button and the developer form is open', () => {
    const { container } = show({ annictToken: null, clientId: null })
    expect(screen.queryByRole('button', { name: 'Annictでログイン' })).toBeNull()
    const dev = container.querySelector('details.settings__dev') as HTMLDetailsElement
    expect(dev.open).toBe(true)
    expect(dev.closest('details.welcome__about')).toBeNull()
  })

  it('connects with a personal token from the developer form', async () => {
    show({ annictToken: null, clientId: null })
    fireEvent.change(screen.getByLabelText('Annictの個人用アクセストークン'), { target: { value: ' tok ' } })
    fireEvent.click(screen.getByRole('button', { name: '連携する' }))
    await waitFor(() => expect(onAnnictTokenChange).toHaveBeenCalledWith('tok'))
    // 保存は App が、持ち主の名前を確かめて記録を入れ替えるのと一度にする
    expect(localStorage.getItem('animax.annictToken')).toBeNull()
  })

  it('does not show the login button once there is a token', () => {
    show({ section: 'settings-account', clientId: 'cid' })
    expect(screen.queryByRole('button', { name: 'Annictでログイン' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'GitHub連携（任意）' })).toBeTruthy()
  })
})

describe('Settings about block', () => {
  it('is folded under the notes below the login button when signed out', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    expect(container.querySelector('.welcome__notes + details.welcome__about')).toBeTruthy()
  })

  it('is the last group when signed in', () => {
    show()
    expect([...document.querySelectorAll('.folder b')].at(-1)?.textContent).toBe('このアプリ')
  })

  it('states what the app is and where data goes', () => {
    show({ section: 'settings-about' })
    const text = screen.getByRole('heading', { name: 'このアプリについて' }).parentElement!.textContent!
    expect(text).toContain('個人が開発した、Annictの非公式アプリです')
    expect(text).toContain('運営サーバーに、利用者の記録やトークンは置きません。トークンはこの端末のブラウザに保存します')
    expect(text).toContain('サーバーで動くのは、ログインの受け渡し・Shikimoriへの中継・問い合わせの受け付けの3つの処理だけです')
    expect(text).toContain('問い合わせの内容は送ったときだけ開発者に届きます（公開はされません）')
    expect(text).toContain('通信先はAnnict・Shikimori・Wikipedia・Google Fontsです（英語の画面では、声優・スタッフの英語名を引くためにWikidataも）。Shikimoriの作品データは上に書いたサーバーの処理（Vercel）を通して受け取ります。その処理はShikimoriの公開データを控えたり、問い合わせの回数を数えたりするために、Upstash（Redis）を使います（利用者の情報は置きません）。GitHubと連携した場合は、GitHubにも送信します')
    expect(text).toContain('問い合わせを送ったときは、その内容だけがこのサイトの関数を通して運営者の非公開のGitHubリポジトリに届きます')
    expect(text).toContain('各作品の公式サイトの画像を表示しています。画像はブラウザが提供元から直接読み込みます。権利は各権利者に帰属します')
    expect(text).toContain('作品データの一部（ジャンル・似た作品・一部の表紙・声優やスタッフの参加作品）はShikimoriから取得しています')
    expect((screen.getByRole('link', { name: 'Shikimori' }) as HTMLAnchorElement).href).toBe('https://shikimori.io/')

    // Annict は API で取れるものだけを使う（作品ページは読まない）。あらすじは Wikipedia から、出典とライセンスを添えて
    expect(text).not.toMatch(/作品ページ/)
    expect(text).toContain('Wikipediaの記事の冒頭を、出典とライセンス（CC BY-SA 4.0）を添えて表示しています')
  })

  it('links to the source code and shows the version', () => {
    show({ section: 'settings-about' })
    expect((screen.getByRole('link', { name: 'ソースコード（GitHub）' }) as HTMLAnchorElement).href).toBe('https://github.com/manato003/Anipair')
    expect(screen.getByText(/^バージョン \d+\.\d+\.\d+/)).toBeTruthy()
  })
})

describe('Settings layout (sections, status first, folded explanations)', () => {

  it('lists the six groups first (phone), and each opens its sections, with a way back to the list', () => {
    show()
    const groups = [...document.querySelectorAll('.folder b')].map((b) => b.textContent)
    expect(groups).toEqual(['アカウント', '表示', 'バックアップ', 'キー', 'お問い合わせ', '最新情報', 'このアプリ'])
    const opened: Record<string, string[]> = {
      アカウント: ['Annict連携', 'GitHub連携（任意）'],
      // 表示は見出しを付けず、1つずつの行に並べる（#30）
      表示: [],
      バックアップ: ['バックアップ'],
      キー: ['キーバインド（PC）'],
      お問い合わせ: ['質問・不具合・要望を送る', 'よくある質問'],
      最新情報: ['公式X', '開発記録', 'Anipair開発日誌'],
      このアプリ: ['このアプリについて'],
    }
    for (const [group, sections] of Object.entries(opened)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${group}`) }))
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(group)
      expect(screen.queryAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(sections)
      fireEvent.click(screen.getByRole('button', { name: '設定' }))
      expect(document.querySelectorAll('.folder')).toHaveLength(7)
    }
  })

  it('opens the group of a requested section (the shortcuts of the control center)', () => {
    show({ section: 'settings-effects' })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('表示')
    expect(document.getElementById('settings-effects')).toBeTruthy()
  })

  it('has no groups on the signed-out first screen', () => {
    show({ annictToken: null, clientId: 'cid' })
    expect(document.querySelector('.folder')).toBeNull()
  })

  it('deletes the data on this device only after a confirmation, from inside 詳しく', () => {
    show({ section: 'settings-account' })
    const del = screen.getByRole('button', { name: 'ログアウトして、Anipairのデータを削除' })
    expect(del.closest('details')).toBeTruthy()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    fireEvent.click(del)
    expect(onAnnictTokenChange).not.toHaveBeenCalled()
    fireEvent.click(del)
    expect(onAnnictTokenChange).toHaveBeenCalledWith(null, { forget: true })
    confirm.mockRestore()
  })

  it('shows who is connected as the status of the account section', async () => {
    show({ section: 'settings-account' })
    expect(await screen.findByText('テスト（@tester）で連携中')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeTruthy()
  })

  it('GitHub connected: shows the repo as the status and hides the setup steps and the form', () => {
    show({ section: 'settings-github' })
    expect(screen.getByRole('link', { name: 'me/anipair-data' }).closest('.status-chip')?.textContent).toContain('と連携中')
    expect(document.querySelector('.settings__card#settings-github ol')).toBeNull()
    expect(screen.queryByText('連携の手順（3ステップ）')).toBeNull()
  })

  it('GitHub not connected: shows the not-connected status, and the steps (open) after pressing 連携する', () => {
    show({ section: 'settings-github', github: null })
    expect(screen.getByText('未連携')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '連携する' }))
    expect((screen.getByText('連携の手順（3ステップ）').closest('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('puts the export and the backup-now buttons side by side, and folds the explanation of the automatic backup', () => {
    show({ section: 'settings-backup' })
    const row = screen.getByRole('button', { name: 'ファイルに書き出す' }).parentElement!
    expect(row.className).toBe('settings__actions')
    expect(row.contains(screen.getByRole('button', { name: '今すぐバックアップ' }))).toBe(true)
    expect((screen.getByText('自動バックアップについて').closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('shows the last backup as a status chip', () => {
    store({ lastAt: new Date(2026, 9, 2, 21, 4).toISOString(), written: true, error: null })
    show({ section: 'settings-backup' })
    expect(screen.getByText('前回: 2026/10/2 21:04（保存）').className).toContain('status-chip')
  })

  it('keys: open on a device with a keyboard; not offered at all on a touch-only device (phones)', () => {
    const { unmount } = show({ section: 'settings-keys' })
    expect((screen.getByText('キーの割り当て').closest('details') as HTMLDetailsElement).open).toBe(true)
    unmount()
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia
    try {
      show()
      expect([...document.querySelectorAll('.folder b')].map((b) => b.textContent)).toEqual(['アカウント', '表示', 'バックアップ', 'お問い合わせ', '最新情報', 'このアプリ'])
    } finally {
      window.matchMedia = original
    }
  })

  it.each([
    ['signed in', {}],
    ['signed out', { annictToken: null, clientId: null }],
  ])('links to the terms and the privacy policy when %s', (_name, over) => {
    show({ section: 'settings-about', ...over })
    expect((screen.getAllByRole('link', { name: '利用規約' })[0] as HTMLAnchorElement).getAttribute('href')).toBe('/terms.html')
    expect((screen.getAllByRole('link', { name: 'プライバシーポリシー' })[0] as HTMLAnchorElement).getAttribute('href')).toBe('/privacy.html')
  })

  it('the signed-out first screen keeps the terms inside 「このアプリについて」', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    expect(container.querySelector('details.welcome__about a[href="/terms.html"]')).toBeTruthy()
  })

  // 新規登録は多くの人に、別のアカウントは少数に関わるので、新規登録を先に。1つずつ「・」で分ける（2026-10-13 利用者）
  it('lists the sign-up note before the other-account note', () => {
    localStorage.setItem('animax.owner.v1', '!')
    const { container } = show({ annictToken: null, clientId: 'cid' })
    const items = [...container.querySelectorAll('.welcome__notes > li')].map((li) => li.textContent)
    expect(items).toHaveLength(2)
    expect(items[0]).toContain('アカウントをお持ちでない方は')
    expect(items[1]).toContain('別のアカウントで連携するときは')
  })
})

// 英語の画面（ブラウザの言語が日本語でなければ英語。2026-10-20 利用者）
describe('Settings in English', () => {
  it('shows the welcome in English, and says how anime titles are shown', () => {
    resetLangForTests('en')
    const { container } = show({ annictToken: null, clientId: 'cid' })
    expect(container.querySelector('.welcome__tagline')?.textContent).toBe(TAGLINE_PHRASES_EN.join(' '))
    expect(screen.getByRole('button', { name: 'Log in with Annict' })).toBeTruthy()
    expect(screen.getByText(/Anime titles are shown in romanized Japanese/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'sign up on Annict' })).toBeTruthy()
    const about = container.querySelector('details.welcome__about') as HTMLDetailsElement
    expect(about.querySelector(':scope > summary')?.textContent).toBe('About this app')
    expect(about.textContent).toContain('It is not affiliated with Annict')
    expect(screen.getAllByRole('link', { name: 'Terms of Use' })[0].getAttribute('href')).toBe('/terms.html')
  })

  // 押すと言語を覚える。描き直しは根元（main.tsx）が言語を key にして行うので、ここでは描き直して確かめる
  it('remembers the language chosen with the button', () => {
    show({ annictToken: null, clientId: 'cid' })
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
    expect(localStorage.getItem('animax.lang.v1')).toBe('en')
    cleanup()
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.getByRole('button', { name: 'Log in with Annict' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '日本語に切り替える' }))
    expect(localStorage.getItem('animax.lang.v1')).toBe('ja')
  })

  it('shows the signed-in settings in English too', () => {
    resetLangForTests('en')
    show({ section: 'settings-about' })
    expect(screen.getAllByRole('link', { name: 'Terms of Use' }).length).toBeGreaterThan(0)
  })
})

describe('Settings 使い方を見る', () => {
  it('opens the usage guide from 「このアプリについて」, and closing it counts as seen', () => {
    show({ section: 'settings-about' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '使い方を見る' }))
    expect(screen.getByRole('dialog', { name: 'Anipairの使い方' })).toBeTruthy()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(localStorage.getItem('animax.onboarding.v1')).toContain('"v":1')
  })

  it('opens 「アニとペアのこと」 with where they came from, their habits, likes, and the season sprouts', () => {
    show({ section: 'settings-about' })
    fireEvent.click(screen.getByRole('button', { name: 'アニとペアのこと' }))
    const dialog = screen.getByRole('dialog', { name: 'アニとペアのこと' })
    expect(within(dialog).getByRole('heading', { name: 'アニ' })).toBeTruthy()
    expect(within(dialog).getByRole('heading', { name: 'ペア' })).toBeTruthy()
    expect(within(dialog).getAllByText('生まれ')).toHaveLength(2)
    expect(within(dialog).getAllByText('好きなもの')).toHaveLength(2)
    expect(within(dialog).getByText('冬')).toBeTruthy()
  })

  it('is also there on the signed-out first screen', () => {
    show({ annictToken: null, clientId: null })
    expect(screen.getByRole('button', { name: '使い方を見る' })).toBeTruthy()
  })
})

// #30（2026-10-13 利用者）: お問い合わせは X の DM でも受け付ける
describe('Settings contact', () => {
  it('says that X DMs and GitHub issues are also accepted', () => {
    show({ section: 'settings-contact' })
    expect((screen.getByRole('link', { name: 'XのDMで送る' }) as HTMLAnchorElement).href).toBe('https://x.com/anipairAPP')
    expect((screen.getByRole('link', { name: 'GitHubのIssues' }) as HTMLAnchorElement).href).toBe('https://github.com/manato003/Anipair/issues')
  })
})

// #30（2026-10-13 利用者）: 最新情報（公式 X と開発日誌）を項目に分ける
describe('Settings news', () => {
  it('shows the official X account and the devlog articles by title', () => {
    show({ section: 'settings-devlog' })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('最新情報')
    expect((screen.getByRole('link', { name: 'Xで@anipairAPPを見る' }) as HTMLAnchorElement).href).toBe('https://x.com/anipairAPP')
    expect(screen.getByText('最新情報や、Anipairを使うときに役立つことを投稿しています。')).toBeTruthy()
    const titles = [...document.querySelectorAll('.devlog a')].map((a) => [a.textContent, (a as HTMLAnchorElement).href])
    expect(titles).toEqual([
      ['Annictの記録をタップで付けて、次に見るアニメを理由つきで提案するWebアプリを作った', 'https://zenn.dev/manato003/articles/anipair-annict-anime-app'],
      ['公開APIを使わせてもらう側として、負担をかけないクライアント作りで意識したこと', 'https://zenn.dev/manato003/articles/anipair-gentle-api-client'],
    ])
    // 新しい記事は、アプリを直さなくてもプロフィールからたどれる
    expect((screen.getByRole('link', { name: 'Zennの記事をすべて見る' }) as HTMLAnchorElement).href).toBe('https://zenn.dev/manato003')
  })

  // #39: 新しい版をまだ開発記録で見ていなければ印を付け、開いたら消す
  it('marks a new version until development history is opened', async () => {
    show({ section: 'settings-history' })
    const block = document.getElementById('settings-history')!
    expect(within(block).getByText('新しい版')).toBeTruthy()
    expect(within(block).getByText(`いまの版 ${__APP_VERSION__}`, { exact: false })).toBeTruthy()

    fireEvent.click(within(block).getByRole('button', { name: '開発記録を見る' }))
    // 1枚は開いたときに CHANGELOG ごと読み込む（全部のテストを同時に流すと1秒を超えることがある）
    const sheet = await screen.findByRole('dialog', { name: '開発記録' }, { timeout: 10000 })
    // 一番上に最新の版、その下に節目を新しい順に。一番古い節目は始まりの版から
    expect(within(sheet).getByRole('heading', { level: 3, name: (name) => name.startsWith(`v${__APP_VERSION__}`) })).toBeTruthy()
    const names = [...sheet.querySelectorAll('.history__name')].map((n) => n.textContent)
    expect(names[0]).toBe('Tier表')
    expect(names[names.length - 1]).toBe('1タップで記録する')
    expect(sheet.querySelectorAll('.history__bar')).toHaveLength(names.length)
    expect(within(block).queryByText('新しい版')).toBeNull()
    expect(localStorage.getItem('animax.historySeen.v1')).toBe(__APP_VERSION__)

    // 節目を押すと、その節目の版を1枚で開く
    fireEvent.click(within(sheet.querySelector<HTMLElement>('.history__list')!).getByRole('button', { name: /1タップで記録する/ }))
    const detail = await screen.findByRole('dialog', { name: '1タップで記録する' })
    expect(within(detail).getByRole('heading', { level: 3, name: /^v0\.1\.0/ })).toBeTruthy()
  })
})
