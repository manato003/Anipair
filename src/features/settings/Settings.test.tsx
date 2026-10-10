// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAGLINE } from '../../lib/brand'
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
    expect(screen.getByText(/GitHub と連携すると、毎日自動でバックアップされ、変更履歴も残ります/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: '今すぐバックアップ' })).toBeNull()
    expect(screen.queryByText('GitHub で見る')).toBeNull()
    expect(screen.queryByText('変更履歴')).toBeNull()
  })

  it('explains where it is saved and that past versions stay in the history', () => {
    show({ section: 'settings-backup' })
    const text = screen.getByText(/backup\.json に自動で保存します/).textContent
    expect(text).toContain('me/anipair-data')
    expect(text).toContain('過去の版は GitHub の変更履歴から確認できます')
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
    store({ lastAt: null, written: false, error: 'GitHub に接続できませんでした。通信を確認してください' })
    show({ section: 'settings-backup' })
    expect(screen.getByText(/前回のバックアップに失敗しました: GitHub に接続できませんでした/)).toBeTruthy()
  })

  it('links to the file and its history in the configured repo', () => {
    show({ section: 'settings-backup', github: { token: 'g', repo: 'someone/their-data' } })
    expect((screen.getByRole('link', { name: 'GitHub で見る' }) as HTMLAnchorElement).href).toBe('https://github.com/someone/their-data/blob/main/backup.json')
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
      store({ lastAt: null, written: false, error: 'Annict のトークンが使えません' })
      throw new Error('Annict のトークンが使えません')
    })
    show({ section: 'settings-backup' })
    fireEvent.click(screen.getByRole('button', { name: '今すぐバックアップ' }))
    expect(await screen.findByText(/前回のバックアップに失敗しました: Annict のトークンが使えません/)).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: '今すぐバックアップ' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/バックアップしました/)).toBeNull()
  })
})

describe('Settings GitHub block', () => {
  const formOf = () => screen.getByLabelText('GitHub のリポジトリ名').closest('form')!
  const connectButton = () => formOf().querySelector('button[type="submit"]') as HTMLButtonElement

  function fill(repo: string, token: string) {
    fireEvent.change(screen.getByLabelText('GitHub のリポジトリ名'), { target: { value: repo } })
    fireEvent.change(screen.getByLabelText('GitHub の Fine-grained トークン'), { target: { value: token } })
  }

  it('says what connecting adds, and that everything else works without it', () => {
    show({ section: 'settings-github', github: null })
    expect(screen.getByRole('heading', { name: 'GitHub 連携（任意）' })).toBeTruthy()
    expect(screen.getByText('興味なし・保留・見てないを、PC とスマホで共有する')).toBeTruthy()
    expect(screen.getByText('作品ごとの記録を、毎日自動でバックアップする（変更履歴つき）')).toBeTruthy()
    expect(screen.getByText(/連携しなくても、すべての機能を使えます/)).toBeTruthy()
  })

  it('not connected: shows the steps with links, and the form', () => {
    show({ section: 'settings-github', github: null })
    expect((screen.getByRole('link', { name: 'リポジトリの作成画面を開く' }) as HTMLAnchorElement).href).toBe(
      'https://github.com/new?name=anipair-data&visibility=private',
    )
    expect((screen.getByRole('link', { name: 'トークンの作成画面を開く' }) as HTMLAnchorElement).href).toBe(
      'https://github.com/settings/personal-access-tokens/new',
    )
    expect(screen.getByText(/Contents を「Read and write」/)).toBeTruthy()
    expect(screen.getByLabelText('GitHub のリポジトリ名')).toBeTruthy()
    expect(screen.getByLabelText('GitHub の Fine-grained トークン')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '連携を解除' })).toBeNull()
    // 作者の旧リポジトリ名はどこにも出ない
    expect(document.body.textContent).not.toContain('animax-data')
  })

  it('the connect button needs both fields', () => {
    show({ section: 'settings-github', github: null })
    expect(connectButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('GitHub のリポジトリ名'), { target: { value: 'me/anipair-data' } })
    expect(connectButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('GitHub の Fine-grained トークン'), { target: { value: 'tok' } })
    expect(connectButton().disabled).toBe(false)
  })

  it('verifies with the repo and token first, then saves both and connects', async () => {
    show({ section: 'settings-github', github: null })
    fill(' me/anipair-data ', ' tok ')
    fireEvent.submit(formOf())
    await waitFor(() => expect(onGithubChange).toHaveBeenCalledWith({ token: 'tok', repo: 'me/anipair-data' }))
    expect(checkAccess).toHaveBeenCalledWith({ token: 'tok', repo: 'me/anipair-data' })
    expect(localStorage.getItem('animax.githubToken')).toBe('tok')
    expect(localStorage.getItem('animax.githubRepo')).toBe('me/anipair-data')
    expect(await screen.findByText('me/anipair-data と連携しました')).toBeTruthy()
  })

  it('on a verification failure shows the error and saves nothing', async () => {
    vi.mocked(checkAccess).mockRejectedValueOnce(new GitHubError('このトークンでは me/anipair-data が見えません。', 'auth'))
    show({ section: 'settings-github', github: null })
    fill('me/anipair-data', 'tok')
    fireEvent.submit(formOf())
    expect(await screen.findByText(/このトークンでは me\/anipair-data が見えません/)).toBeTruthy()
    expect(onGithubChange).not.toHaveBeenCalled()
    expect(localStorage.getItem('animax.githubToken')).toBeNull()
    expect(localStorage.getItem('animax.githubRepo')).toBeNull()
    // 直して、もう一度試せる
    await waitFor(() => expect(connectButton().disabled).toBe(false))
  })

  it('rejects a malformed repository name without calling GitHub', () => {
    show({ section: 'settings-github', github: null })
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
    expect(screen.queryByLabelText('GitHub のリポジトリ名')).toBeNull()
    expect(screen.queryByLabelText('GitHub の Fine-grained トークン')).toBeNull()
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
    expect(await screen.findByText('anipair-backup-2026-10-01.json を保存しました（見た 60・見たい 45・評価 58）')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'ファイルに書き出す' }) as HTMLButtonElement).disabled).toBe(false)
    // GitHub のバックアップは動かさない
    expect(runBackup).not.toHaveBeenCalled()
  })

  it('shows the error and enables the button again when it fails', async () => {
    vi.mocked(exportBackupFile).mockRejectedValue(new Error('Annict のトークンが使えません'))
    show({ section: 'settings-backup', github: null })
    fireEvent.click(screen.getByRole('button', { name: 'ファイルに書き出す' }))
    expect(await screen.findByText('Annict のトークンが使えません')).toBeTruthy()
    await waitFor(() => expect((screen.getByRole('button', { name: 'ファイルに書き出す' }) as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByText(/を保存しました/)).toBeNull()
  })
})

describe('Settings first screen (no Annict token)', () => {
  it('says what the app is, offers the login, and links to Annict sign-up', () => {
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.getByRole('heading', { name: 'Anipair' })).toBeTruthy()
    expect(screen.getByText(/タップだけで付けられるアプリです/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annict でログイン' })).toBeTruthy()
    expect(screen.getByText(/ご利用には Annict のアカウントが必要です/)).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Annict で新規登録' }) as HTMLAnchorElement).href).toBe('https://annict.com/sign_up')
  })

  it('puts the logo and the tagline at the top of the welcome', () => {
    show({ annictToken: null, clientId: 'cid' })
    const heading = screen.getByRole('heading', { name: 'Anipair' })
    expect(heading.querySelector('svg.logo__mark')).toBeTruthy()
    // ロゴの次に、2人で並んでアニメを見ている絵、その次にキャッチコピー
    expect(heading.nextElementSibling?.getAttribute('aria-label')).toBe('アニとペアが並んでアニメを見ている')
    expect(heading.nextElementSibling?.nextElementSibling?.textContent).toBe(TAGLINE)
  })

  it('shows only the welcome and the about block (no GitHub, backup or keys yet)', () => {
    show({ annictToken: null, clientId: 'cid' })
    expect(screen.getByRole('heading', { name: 'このアプリについて' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'GitHub 連携（任意）' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'バックアップ' })).toBeNull()
  })

  it('starts the login with the client id and this origin', () => {
    show({ annictToken: null, clientId: 'cid' })
    fireEvent.click(screen.getByRole('button', { name: 'Annict でログイン' }))
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

  it('folds the personal-token form under the developer heading when the login is available', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    const details = container.querySelector('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('開発者向け: 個人用アクセストークンで使う')
    expect(details.querySelector('input[type="password"]')).toBeTruthy()
  })

  it('without a client id there is no login button and the developer form is open', () => {
    const { container } = show({ annictToken: null, clientId: null })
    expect(screen.queryByRole('button', { name: 'Annict でログイン' })).toBeNull()
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('connects with a personal token from the developer form', async () => {
    show({ annictToken: null, clientId: null })
    fireEvent.change(screen.getByLabelText('Annict の個人用アクセストークン'), { target: { value: ' tok ' } })
    fireEvent.click(screen.getByRole('button', { name: '連携する' }))
    await waitFor(() => expect(onAnnictTokenChange).toHaveBeenCalledWith('tok'))
    // 保存は App が、持ち主の名前を確かめて記録を入れ替えるのと一度にする
    expect(localStorage.getItem('animax.annictToken')).toBeNull()
  })

  it('does not show the login button once there is a token', () => {
    show({ section: 'settings-account', clientId: 'cid' })
    expect(screen.queryByRole('button', { name: 'Annict でログイン' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'GitHub 連携（任意）' })).toBeTruthy()
  })
})

describe('Settings about block', () => {
  it('is at the end of the screen when signed out', () => {
    show({ annictToken: null, clientId: null })
    const headings = screen.getAllByRole('heading').map((h) => h.textContent)
    expect(headings.at(-1)).toBe('このアプリについて')
  })

  it('is the last group when signed in', () => {
    show()
    expect([...document.querySelectorAll('.folder b')].at(-1)?.textContent).toBe('このアプリ')
  })

  it('states what the app is and where data goes', () => {
    show({ section: 'settings-about' })
    const text = screen.getByRole('heading', { name: 'このアプリについて' }).parentElement!.textContent!
    expect(text).toContain('個人が開発した Annict の非公式アプリ')
    expect(text).toContain('運営サーバーはなく、利用者の情報は保存しません')
    expect(text).toContain('サーバーで動くのは、ログインの受け渡しと Shikimori への中継の2つの処理だけです')
    expect(text).toContain('通信先は Annict と Shikimori（このサイトの中継を経由）と Wikipedia です。GitHub と連携した場合は、GitHub にも送信します')
    expect(text).toContain('トークンは、この端末の中にだけ保存されます')
    expect(text).toContain('各作品の公式サイトの画像を表示しています。権利は各権利者に帰属します')
    expect(text).toContain('作品データの一部（ジャンル・似た作品・一部の表紙・声優やスタッフの参加作品）は Shikimori から取得しています')
    expect((screen.getByRole('link', { name: 'Shikimori' }) as HTMLAnchorElement).href).toBe('https://shikimori.io/')
    // Annict は API で取れるものだけを使う（作品ページは読まない）。あらすじは Wikipedia から、出典とライセンスを添えて
    expect(text).not.toMatch(/作品ページ/)
    expect(text).toContain('Wikipedia の記事の冒頭を、出典とライセンス（CC BY-SA 4.0）を添えて表示しています')
  })

  it('links to the source code and shows the version', () => {
    show({ section: 'settings-about' })
    expect((screen.getByRole('link', { name: 'ソースコード（GitHub）' }) as HTMLAnchorElement).href).toBe('https://github.com/manato003/anipair')
    expect(screen.getByText(/^バージョン \d+\.\d+\.\d+/)).toBeTruthy()
  })
})

describe('Settings layout (sections, status first, folded explanations)', () => {

  it('lists the five groups first (phone), and each opens its sections, with a way back to the list', () => {
    show()
    const groups = [...document.querySelectorAll('.folder b')].map((b) => b.textContent)
    expect(groups).toEqual(['アカウント', '表示', 'バックアップ', 'キー', 'このアプリ'])
    const opened: Record<string, string[]> = {
      アカウント: ['Annict 連携（必須）', 'GitHub 連携（任意）'],
      表示: ['表示', 'ボタンの表示', '演出'],
      バックアップ: ['バックアップ'],
      キー: ['キーバインド（PC）'],
      このアプリ: ['このアプリについて'],
    }
    for (const [group, sections] of Object.entries(opened)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${group}`) }))
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(group)
      expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(sections)
      fireEvent.click(screen.getByRole('button', { name: '設定' }))
      expect(document.querySelectorAll('.folder')).toHaveLength(5)
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

  it('GitHub not connected: shows the steps (open) and the not-connected status', () => {
    show({ section: 'settings-github', github: null })
    expect(screen.getByText('未連携')).toBeTruthy()
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
      expect([...document.querySelectorAll('.folder b')].map((b) => b.textContent)).toEqual(['アカウント', '表示', 'バックアップ', 'このアプリ'])
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

  it('the signed-out first screen also has the small footer links under the sign-up note', () => {
    const { container } = show({ annictToken: null, clientId: 'cid' })
    expect(container.querySelector('.settings__legal a[href="/terms.html"]')).toBeTruthy()
  })
})

describe('Settings 使い方を見る', () => {
  it('opens the usage guide from 「このアプリについて」, and closing it counts as seen', () => {
    show({ section: 'settings-about' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '使い方を見る' }))
    expect(screen.getByRole('dialog', { name: 'Anipair の使い方' })).toBeTruthy()
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
