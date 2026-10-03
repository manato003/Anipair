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
      summary="見た・見たいなどの状態と日時、評価（5項目と本文）、パス・スルー、「見てない」を、JSON ファイルにして控えられます。"
      status={
        props.github ? (
          <StatusChip tone={status.error ? 'off' : 'ok'}>
            {status.lastAt ? `前回: ${formatTime(status.lastAt)}（${status.written ? '保存' : '変更なし'}）` : 'まだ取っていません'}
          </StatusChip>
        ) : undefined
      }
    >
      {props.github && status.error && <p className="settings__error">前回の失敗: {status.error}</p>}
      <div className="settings__actions">
        <button type="button" className="btn" disabled={exporting} onClick={exportNow}>
          {exporting ? '書き出しています…' : 'ファイルに書き出す'}
        </button>
        {props.github && (
          <button type="button" className="btn" disabled={running} onClick={backupNow}>
            {running ? 'バックアップ中…' : '今すぐバックアップ'}
          </button>
        )}
      </div>
      {exportError && <p className="settings__error">{exportError}</p>}
      {exported && <p className="settings__ok">{`書き出しました（${exported.fileName}。${describeCounts(exported.counts)}）`}</p>}
      {result && (
        <p className="settings__ok">
          {result.written ? `保存しました（${describeCounts(result.counts)}）` : '前回から変わっていないので、書き込みませんでした'}
        </p>
      )}
      {!props.github ? (
        <p className="settings__status">上の「GitHub とつなぐ」でつなぐと、毎日の自動バックアップも取れます（履歴つき）。</p>
      ) : (
        <>
          <p className="settings__links">
            <a href={`https://github.com/${props.github.repo}/blob/main/backup.json`} target="_blank" rel="noreferrer">
              GitHub で見る
            </a>
            <a href={`https://github.com/${props.github.repo}/commits/main/backup.json`} target="_blank" rel="noreferrer">
              履歴
            </a>
          </p>
          <details className="settings__fold">
            <summary>自動バックアップのしくみ</summary>
            <p className="settings__lead">
              つないだ GitHub の {props.github.repo} の backup.json にも保存し、変わったときだけ書き込むので、過去の版は GitHub の履歴に残ります。
              アプリを開いたとき、前回から1日たっていれば自動でも取ります。
            </p>
          </details>
        </>
      )}
    </Section>
  )
}
