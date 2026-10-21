import { downloadText } from '../../lib/download'
import { formatJson } from '../../lib/github'
import { collectSnapshot } from './backupStore'
import { countSnapshot, type SnapshotCounts } from './snapshot'

// 全記録を JSON ファイルにして端末に保存する。GitHub につないでいなくても使える。
// 中身と書式は GitHub に置く backup.json と同じ（collectSnapshot と formatJson を共有している）

export interface ExportResult {
  fileName: string
  counts: SnapshotCounts
}

// anipair-backup-2026-10-01.json（日付は端末の時刻で）
export function exportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `anipair-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

export async function exportBackupFile(annictToken: string, now: Date = new Date()): Promise<ExportResult> {
  const snapshot = await collectSnapshot(annictToken, now)
  const fileName = exportFileName(now)
  downloadText(fileName, formatJson(snapshot), 'application/json')
  return { fileName, counts: countSnapshot(snapshot) }
}
