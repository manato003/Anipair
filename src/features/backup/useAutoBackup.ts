import { useEffect, useRef } from 'react'
import type { GithubConnection } from '../../lib/github'
import { isBackupDue, runBackup } from './backupStore'

// 開いた直後の画面は Annict を読む（1秒約3回の同じ列に並ぶ）ので、それが落ち着いてから取る
export const AUTO_BACKUP_DELAY_MS = 15_000

// アプリを開いたとき、Annict のトークンがあり GitHub につないでいて、前回の成功から24時間たっていれば、裏で1回バックアップを取る。
// 成功しても何も出さない。失敗は控えに残り（設定画面に出る）、次にアプリを開いたときにまた試す。
// 同じ起動のうちには自動で2回やらない（失敗してもすぐ繰り返さない）
export function useAutoBackup(annictToken: string | null, github: GithubConnection | null): void {
  const started = useRef(false)

  useEffect(() => {
    if (!annictToken || !github || started.current) return
    const timer = setTimeout(() => {
      // 待っているあいだに手動で取っていれば、時期ではなくなっている
      if (!isBackupDue(new Date())) return
      started.current = true
      // 失敗は runBackup が控えに残すので、ここでは握りつぶしてよい
      runBackup(annictToken, github).catch(() => undefined)
    }, AUTO_BACKUP_DELAY_MS)
    // トークンやリポジトリが変わったら待ちを取り消し、新しいつなぎで数え直す
    return () => clearTimeout(timer)
  }, [annictToken, github])
}
