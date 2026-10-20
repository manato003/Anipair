import { t } from './i18n'

// Annict への接続の状態。アプリがふだん送っている問い合わせの結果（応答までの時間・失敗）を覚えておき、設定の画面で色と一言にする。
// 状態を知るためだけの問い合わせは送らない（不調のときに全員から確認が飛ぶと、それ自体が Annict の負荷になる）。
// annict.com のページは見ない（アプリが使うのは API だけで、ページが落ちていても API は答えていることがある。2026-10-06 に 502 と 15 秒で確認）

export type HealthFailure = 'server' | 'network' | 'timeout'
export interface HealthSample {
  at: number
  // 応答の頭（ステータス）が届くまで。順番待ちの時間は含めない
  ms: number
  ok: boolean
  failure?: HealthFailure
  // failure が server のときの HTTP ステータス
  status?: number
}

export type HealthLevel = 'unknown' | 'ok' | 'slow' | 'down'

// ふだんは軽い問い合わせで0.1秒、ライブラリの1ページで0.8秒。重い日は軽い問い合わせ1件に7〜15秒かかった（2026-10-06）
export const SLOW_MS = 5_000
// この時間内に失敗か遅い応答があれば、いま速くても「不安定」とする
export const RECENT_MS = 5 * 60_000
const KEEP = 20

let samples: HealthSample[] = []
const listeners = new Set<() => void>()

export function recordAnnictHealth(sample: HealthSample): void {
  samples = [...samples.slice(-(KEEP - 1)), sample]
  for (const l of listeners) l()
}

export function subscribeAnnictHealth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// useSyncExternalStore 用。記録するたびに新しい配列になる
export function annictHealthSamples(): readonly HealthSample[] {
  return samples
}

// テスト用
export function resetAnnictHealth(): void {
  samples = []
}

export interface HealthJudgement {
  level: HealthLevel
  label: string
  last: HealthSample | null
}

export function judgeAnnictHealth(list: readonly HealthSample[], now: number): HealthJudgement {
  const last = list.at(-1) ?? null
  if (!last) return { level: 'unknown', label: t('まだ問い合わせていません', 'Not checked yet'), last }
  if (!last.ok) {
    const label =
      last.failure === 'server'
        ? t(`エラーを返しています（HTTP ${last.status}）`, `Returning errors (HTTP ${last.status})`)
        : last.failure === 'timeout'
          ? t('応答を受け取れていません', 'Not getting a response')
          : t('つながりません（この端末の通信を確かめてください）', 'Can’t connect (check this device’s connection)')
    return { level: 'down', label, last }
  }
  if (last.ms > SLOW_MS) return { level: 'slow', label: t('応答に時間がかかっています', 'Responding slowly'), last }
  const shaky = list.some((s) => now - s.at <= RECENT_MS && (!s.ok || s.ms > SLOW_MS))
  if (shaky) return { level: 'slow', label: t('ときどき時間がかかっています（さっきまで遅いか失敗していました）', 'Sometimes slow (it was slow or failing a moment ago)'), last }
  return { level: 'ok', label: t('正常', 'Normal'), last }
}

// 「応答 0.4秒・2分前」
export function healthDetail(sample: HealthSample, now: number): string {
  const sec = sample.ms < 10_000 ? (sample.ms / 1000).toFixed(1) : Math.round(sample.ms / 1000)
  const secs = sample.ms < 100 ? t('0.1秒未満', '<0.1 s') : t(`${sec}秒`, `${sec} s`)
  const ago = Math.max(0, Math.floor((now - sample.at) / 60_000))
  const when =
    ago === 0 ? t('たった今', 'just now') : ago < 60 ? t(`${ago}分前`, `${ago} min ago`) : t(`${Math.floor(ago / 60)}時間前`, `${Math.floor(ago / 60)} h ago`)
  return sample.ok ? t(`応答 ${secs}・${when}`, `Response ${secs} · ${when}`) : t(`${secs}で失敗・${when}`, `Failed after ${secs} · ${when}`)
}
