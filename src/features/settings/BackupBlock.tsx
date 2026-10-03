import { useState } from 'react'
import type { GithubConnection } from '../../lib/github'
import { messageOf } from '../../lib/useWriteQueue'
import { loadBackupStatus, runBackup, type BackupResult, type BackupStatus } from '../backup/backupStore'
import { exportBackupFile, type ExportResult } from '../backup/exportFile'
import { describeCounts } from '../backup/snapshot'
import { Section, StatusChip } from './Section'

// 2026/10/1 21:04（端末の時刻で）
function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BackupBlock(props: { annictToken: string; github: GithubConnection | null }) {
  // 自動の結果もここに出るよう、開くたびに控えから読む（設定は開くたびに作り直される）
  const [status, setStatus] = useState<BackupStatus>(loadBackupStatus)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BackupResult | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState<ExportResult | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  async function backupNow() {
    if (!props.github) return
    setRunning(true)
    setResult(null)
    try {
      setResult(await runBackup(props.annictToken, props.github))
    } catch {
      // 失敗は控えに残るので、下の「前回の失敗」に出る
    } finally {
      setStatus(loadBackupStatus())
      setRunning(false)
    }
  }

  // GitHub につないでいなくても取れる（端末にファイルとして保存する）
  async function exportNow() {
    setExporting(true)
    setExported(null)
    setExportError(null)
    try {
      setExported(await exportBackupFile(props.annictToken))
    } catch (e) {
      setExportError(messageOf(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Section
      id="settings-backup"
      title="バックアップ"
      summary="すべての記録を JSON ファイルとして保存できます。視聴状況とその日時、評価（5項目と本文）、パス・スルー・見てないを含みます。"
      status={
        props.github ? (
          <StatusChip tone={status.error ? 'off' : 'ok'}>
            {status.lastAt ? `前回: ${formatTime(status.lastAt)}（${status.written ? '保存' : '変更なし'}）` : 'まだバックアップしていません'}
          </StatusChip>
        ) : undefined
      }
    >
      {props.github && status.error && <p className="settings__error">前回のバックアップに失敗しました: {status.error}</p>}
      <div className="settings__actions">
        <button type="button" className="btn" disabled={exporting} onClick={exportNow}>
          {exporting ? '書き出しています…' : 'ファイルに書き出す'}
        </button>
        {props.github && (
          <button type="button" className="btn" disabled={running} onClick={backupNow}>
            {running ? 'バックアップしています…' : '今すぐバックアップ'}
          </button>
        )}
      </div>
      {exportError && <p className="settings__error">{exportError}</p>}
      {exported && <p className="settings__ok">{`${exported.fileName} を保存しました（${describeCounts(exported.counts)}）`}</p>}
      {result && (
        <p className="settings__ok">
          {result.written ? `バックアップしました（${describeCounts(result.counts)}）` : '前回から変更がないため、保存しませんでした'}
        </p>
      )}
      {!props.github ? (
        <p className="settings__status">GitHub と連携すると、毎日自動でバックアップされ、変更履歴も残ります。</p>
      ) : (
        <>
          <p className="settings__links">
            <a href={`https://github.com/${props.github.repo}/blob/main/backup.json`} target="_blank" rel="noreferrer">
              GitHub で見る
            </a>
            <a href={`https://github.com/${props.github.repo}/commits/main/backup.json`} target="_blank" rel="noreferrer">
              変更履歴
            </a>
          </p>
          <details className="settings__fold">
            <summary>自動バックアップについて</summary>
            <p className="settings__lead">
              アプリを開いたとき、前回から1日以上たっていれば、{props.github.repo} の backup.json に自動で保存します。内容が変わったときだけ書き込むため、過去の版は GitHub の変更履歴から確認できます。
            </p>
          </details>
        </>
      )}
    </Section>
  )
}
