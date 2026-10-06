import { fetchLibrary } from '../../lib/annict'
import { GitHubError, readJson, writeJson, type GithubConnection } from '../../lib/github'
import { refreshMyReviews } from '../../lib/myReviews'
import { loadBackupStatusRaw, saveBackupStatusRaw } from '../../lib/storage'
import { messageOf } from '../../lib/useWriteQueue'
import { loadLocalPasses } from '../match/passStore'
import { loadLocalUnseen } from '../rate/unseenStore'
import { buildSnapshot, countSnapshot, describeCounts, sameSnapshot, type Snapshot, type SnapshotCounts } from './snapshot'
import { loadLocalWannaNotes } from '../records/wannaNoteStore'

// 全記録のスナップショットを、つないだ GitHub のリポジトリの backup.json に書く（保存だけ。復元はまだ作らない）。
// 中身が前回と同じなら書かない。履歴そのものが世代の控えなので、同じ内容のコミットを積んでも意味が無いため

const PATH = 'backup.json'

// 自動で取る間隔
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface BackupResult {
  written: boolean
  at: string
  counts: SnapshotCounts
}

// 設定画面に出す、前回の結果。成功した時刻は失敗では変えない（自動の判断が「最後に成功した時刻」で決まるため）
export interface BackupStatus {
  lastAt: string | null
  // 最後の成功で書き込んだか（false は「前回から変わっていない」）
  written: boolean
  error: string | null
}

export function parseBackupStatus(value: unknown): BackupStatus {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const lastAt = typeof v.lastAt === 'string' && !Number.isNaN(Date.parse(v.lastAt)) ? v.lastAt : null
  return {
    lastAt,
    written: lastAt !== null && v.written === true,
    error: typeof v.error === 'string' && v.error ? v.error : null,
  }
}

export function loadBackupStatus(): BackupStatus {
  return parseBackupStatus(loadBackupStatusRaw())
}

function saveBackupStatus(status: BackupStatus): void {
  saveBackupStatusRaw(status)
}

// 前回の成功がまだ無い、または24時間以上前なら、自動で取る時期
export function isBackupDue(now: Date): boolean {
  const { lastAt } = loadBackupStatus()
  return lastAt === null || now.getTime() - Date.parse(lastAt) >= BACKUP_INTERVAL_MS
}

let running: Promise<BackupResult> | null = null

// 同時には1つだけ動かす。動いている最中にもう一度頼まれたら、同じ結果を返す
// （自動と「今すぐ」が重なっても、Annict の読み込みと GitHub への書き込みが二重にならない）
export function runBackup(annictToken: string, conn: GithubConnection, opts: { force?: boolean; now?: Date } = {}): Promise<BackupResult> {
  if (running) return running
  const promise = backup(annictToken, conn, opts).finally(() => {
    running = null
  })
  running = promise
  return promise
}

// 全記録のスナップショットを作る（GitHub へのバックアップとファイルへの書き出しで共通）。
// 感想は共有の控え（myReviews.ts）を、取る直前に差分で読み直して使う（バックアップが最新になり、全部を辿り直さずに済む）。
// パスと「見てない」は端末の控え。GitHub につないでいれば同期のたびに内容を合わせてあるので、そのまま使う
export async function collectSnapshot(annictToken: string, now: Date = new Date()): Promise<Snapshot> {
  const [library, reviews] = await Promise.all([fetchLibrary(annictToken, { fresh: true }), refreshMyReviews(annictToken)])
  return buildSnapshot({ library, reviews, passes: loadLocalPasses(), unseen: loadLocalUnseen(), wannaNotes: loadLocalWannaNotes(), now })
}

async function backup(annictToken: string, conn: GithubConnection, opts: { force?: boolean; now?: Date }): Promise<BackupResult> {
  try {
    const snapshot = await collectSnapshot(annictToken, opts.now)
    const counts = countSnapshot(snapshot)
    const written = await save(conn, snapshot, counts, opts.force ?? false)
    saveBackupStatus({ lastAt: snapshot.createdAt, written, error: null })
    return { written, at: snapshot.createdAt, counts }
  } catch (e) {
    // 前回の成功の時刻は残して、失敗だけを控える
    saveBackupStatus({ ...loadBackupStatus(), error: messageOf(e) })
    throw e
  }
}

// 他の端末と同時に書いて拒否されたら、読み直して1回だけやり直す。
// 中身は丸ごとのスナップショットなので、最後に書いた方が勝てばよい
async function save(conn: GithubConnection, snapshot: Snapshot, counts: SnapshotCounts, force: boolean): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const remote = await readJson(conn, PATH)
    if (!force && remote.sha && sameSnapshot(snapshot, remote.value)) return false
    try {
      await writeJson(conn, PATH, snapshot, remote.sha, `バックアップ（${describeCounts(counts)}）`)
      return true
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'conflict' && attempt === 0) continue
      throw e
    }
  }
}
