// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryEntry, MyReview } from '../../lib/annict'
import { formatJson } from '../../lib/github'
import { setPass } from '../match/passStore'
import { setUnseen } from '../rate/unseenStore'

let library: LibraryEntry[] = []
let reviews = new Map<number, MyReview>()
const written: unknown[] = []

vi.mock('../../lib/annict', async (orig) => ({
  ...(await orig<typeof import('../../lib/annict')>()),
  fetchLibrary: vi.fn(async () => library),
}))
vi.mock('../../lib/myReviews', () => ({ refreshMyReviews: vi.fn(async () => reviews) }))

// GitHub は偽物。runBackup が書こうとした中身を受け取って、書き出したファイルと比べる
vi.mock('../../lib/github', async (orig) => ({
  ...(await orig<typeof import('../../lib/github')>()),
  readJson: vi.fn(async () => ({ value: null, sha: null })),
  writeJson: vi.fn(async (_c: unknown, _p: string, value: unknown) => void written.push(value)),
}))

const { fetchLibrary } = await import('../../lib/annict')
const { refreshMyReviews } = await import('../../lib/myReviews')
const { runBackup } = await import('./backupStore')
const { exportBackupFile, exportFileName } = await import('./exportFile')

function entry(annictId: number, state: LibraryEntry['state']): LibraryEntry {
  return { workId: `W${annictId}`, annictId, title: `作品${annictId}`, malAnimeId: null, state, stateAt: '2026-09-01T00:00:00Z' }
}

function review(id: string): MyReview {
  return {
    id,
    body: '',
    createdAt: '2026-09-02T00:00:00Z',
    ratingOverallState: 'GOOD',
    ratingStoryState: null,
    ratingAnimationState: null,
    ratingMusicState: null,
    ratingCharacterState: null,
  }
}

// ダウンロードされた Blob の中身を、createObjectURL に渡された時点で取り出す
let blobs: Blob[] = []
let clicked: { href: string; download: string }[] = []

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsText(blob)
  })
}

beforeEach(() => {
  localStorage.clear()
  library = [entry(1, 'WATCHED'), entry(2, 'WANNA_WATCH')]
  reviews = new Map([[1, review('R1')]])
  written.length = 0
  blobs = []
  clicked = []
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
    blobs.push(b as Blob)
    return 'blob:fake'
  })
  URL.revokeObjectURL = vi.fn()
  // jsdom は <a download> を押してもナビゲーションしない。押された内容だけ控える
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.href, download: this.download })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportFileName', () => {
  it('uses the local date, zero-padded', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe('anipair-backup-2026-01-05.json')
    expect(exportFileName(new Date(2026, 9, 1, 0, 0))).toBe('anipair-backup-2026-10-01.json')
  })
})

describe('exportBackupFile', () => {
  it('downloads a file with the same JSON as the one backed up to GitHub', async () => {
    setPass(10, true, { now: new Date('2026-09-30T01:00:00Z') })
    setUnseen(5, true, new Date('2026-09-30T02:00:00Z'))
    const now = new Date(2026, 9, 1, 12, 0)
    await runBackup('a', { token: 't', repo: 'me/anipair-data' }, { now })
    const result = await exportBackupFile('a', now)

    expect(blobs).toHaveLength(1)
    const text = await readBlob(blobs[0])
    // 中身も書式も、GitHub に書いた backup.json とバイト列まで同じ
    expect(text).toBe(formatJson(written[0]))
    expect(JSON.parse(text)).toMatchObject({
      version: 1,
      app: 'animax',
      works: [{ annictId: 1, review: { id: 'R1', overall: 'GOOD' } }, { annictId: 2, review: null }],
      passes: { passes: { '10': { active: true } } },
      unseen: { unseen: { '5': { active: true } } },
    })
    expect(result).toEqual({ fileName: 'anipair-backup-2026-10-01.json', counts: { watched: 1, wanna: 1, watching: 0, other: 0, rated: 1 } })
  })

  it('reads fresh data from Annict with the given token', async () => {
    await exportBackupFile('annict-token')
    expect(fetchLibrary).toHaveBeenCalledWith('annict-token', { fresh: true })
    expect(refreshMyReviews).toHaveBeenCalledWith('annict-token')
  })

  it('clicks a temporary download link with the file name, then removes it and frees the URL later', async () => {
    vi.useFakeTimers()
    try {
      const promise = exportBackupFile('a', new Date(2026, 9, 1, 12, 0))
      await vi.advanceTimersByTimeAsync(0)
      await promise
      expect(blobs[0].type).toBe('application/json')
      expect(clicked).toEqual([{ href: 'blob:fake', download: 'anipair-backup-2026-10-01.json' }])
      expect(document.querySelector('a[download]')).toBeNull()
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    } finally {
      vi.useRealTimers()
    }
  })

  it('works with no GitHub connection and does not touch GitHub or the backup status', async () => {
    const { readJson, writeJson } = await import('../../lib/github')
    await exportBackupFile('a')
    expect(readJson).not.toHaveBeenCalled()
    expect(writeJson).not.toHaveBeenCalled()
    expect(localStorage.getItem('animax.backup')).toBeNull()
  })

  it('does not download anything when reading from Annict fails', async () => {
    vi.mocked(fetchLibrary).mockRejectedValueOnce(new Error('Annict のトークンが使えません'))
    await expect(exportBackupFile('a')).rejects.toThrow('Annict')
    expect(blobs).toHaveLength(0)
    expect(clicked).toHaveLength(0)
  })
})
