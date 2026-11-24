import { useState } from 'react'
import type { GithubConnection } from '../../lib/github'
import { messageOf } from '../../lib/useWriteQueue'
import { loadBackupStatus, runBackup, type BackupResult, type BackupStatus } from '../backup/backupStore'
import { exportBackupFile, type ExportResult } from '../backup/exportFile'
import { describeCounts } from '../backup/snapshot'
import { t } from '../../lib/i18n'
import { Section, StatusChip } from './Section'
import { Spinner } from '../../components/Loading'

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

  const saved = status.written ? t('保存', 'saved') : t('変更なし', 'no changes')
  return (
    <Section
      id="settings-backup"
      title={t('バックアップ', 'Backup')}
      summary={t('作品ごとの記録をファイルに書き出せます。', 'Export your per-anime records to a file.')}
      status={
        props.github ? (
          <StatusChip tone={status.error ? 'off' : 'ok'}>
            {status.lastAt
              ? t(
                  `前回: ${formatTime(status.lastAt)}（${saved}）`,
                  `Last: ${formatTime(status.lastAt)} (${saved})`,
                )
              : t('まだバックアップしていません', 'No backup yet')}
          </StatusChip>
        ) : undefined
      }
    >
      {props.github && status.error && <p className="settings__error">{t('前回のバックアップに失敗しました: ', 'The last backup failed: ')}{status.error}</p>}
      <div className="settings__actions">
        <button type="button" className="btn" disabled={exporting} onClick={exportNow}>
          {exporting ? (
            <>
              <Spinner />
              {t('書き出しています…', 'Exporting…')}
            </>
          ) : (
            t('ファイルに書き出す', 'Export to file')
          )}
        </button>
        {props.github && (
          <button type="button" className="btn" disabled={running} onClick={backupNow}>
            {running ? (
            <>
              <Spinner />
              {t('バックアップしています…', 'Backing up…')}
            </>
          ) : (
            t('今すぐバックアップ', 'Back up now')
          )}
          </button>
        )}
      </div>
      {exportError && <p className="settings__error">{exportError}</p>}
      {exported && <p className="settings__ok">{t(`${exported.fileName}を保存しました（${describeCounts(exported.counts)}）`, `Saved ${exported.fileName} (${describeCounts(exported.counts)})`)}</p>}
      {result && (
        <p className="settings__ok">
          {result.written
            ? t(`バックアップしました（${describeCounts(result.counts)}）`, `Backed up (${describeCounts(result.counts)})`)
            : t('前回から変更がないため、保存しませんでした', 'Nothing has changed since the last backup, so nothing was saved')}
        </p>
      )}
      {/* 中身の細かい説明は畳む */}
      <details className="settings__fold">
        <summary>{t('書き出す中身', 'What’s included')}</summary>
        <p className="settings__lead">
          {t(
            '視聴状況とその日時、評価（5項目と本文）、興味なし・保留・見てない、見たいの優先とメモ、マッチングの苦手な項目、Tier表を含みます。話ごとの記録は含みません（Annictに残ります）。',
            'Includes watch status and dates, ratings (the 5 categories and your review text), Not interested / Later / Haven’t seen, the priority and note for Want to watch, the Matching dislikes, and your tier lists. Per-episode records aren’t included (they stay on Annict).',
          )}
        </p>
      </details>
      {!props.github ? (
        <p className="settings__hint">{t('GitHubと連携すると、アプリを開いたときに1日1回、自動でバックアップします。', 'Connect GitHub to back up automatically once a day when you open the app.')}</p>
      ) : (
        <>
          <p className="settings__links">
            <a href={`https://github.com/${props.github.repo}/blob/HEAD/backup.json`} target="_blank" rel="noreferrer">
              {t('GitHubで見る', 'View on GitHub')}
            </a>
            <a href={`https://github.com/${props.github.repo}/commits/HEAD/backup.json`} target="_blank" rel="noreferrer">
              {t('変更履歴', 'Change history')}
            </a>
          </p>
          <details className="settings__fold">
            <summary>{t('自動バックアップについて', 'About automatic backup')}</summary>
            <p className="settings__lead">
              {t(
                `アプリを開いたとき、前回から1日以上たっていれば、${props.github.repo}のbackup.jsonに自動で保存します。内容が変わったときだけ書き込むため、以前の内容はGitHubの変更履歴から確認できます。`,
                `When you open the app and a day or more has passed since the last backup, it saves automatically to backup.json in ${props.github.repo}. It only writes when something has changed, so you can look at earlier versions in GitHub’s change history.`,
              )}
            </p>
            {/* Annict の API利用規約 第7条（連携を解除したら利用者情報を消す）。バックアップは利用者のリポジトリにあり、アプリからは消さないので、消し方を伝える（Issue #40） */}
            <p className="settings__lead">
              {t(
                'バックアップにはAnnictの記録（ライブラリ・評価と感想）も入ります。Annictとの連携を解除しても、このリポジトリの中身は残ります。消すときはGitHubでファイルを削除してください。変更履歴にも残るので、履歴ごと消すにはリポジトリを削除してください。',
                'The backup also contains your Annict records (your library, ratings and comments). Disconnecting from Annict does not delete anything in this repository. To delete it, delete the file on GitHub. Its earlier contents stay in the change history, so to remove those too, delete the repository.',
              )}
            </p>
          </details>
        </>
      )}
    </Section>
  )
}
