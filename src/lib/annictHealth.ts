// Annict の API の調子。アプリがふだん送っている問い合わせの結果（応答までの時間・失敗）を覚えておき、設定の画面で色と一言にする。
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
  if (!last) return { level: 'unknown', label: 'まだ問い合わせていません', last }
  if (!last.ok) {
    const label =
      last.failure === 'server' ? `エラーを返しています（HTTP ${last.status}）` : last.failure === 'timeout' ? '応答がありません' : 'つながりません（この端末の通信か Annict の不調）'
    return { level: 'down', label, last }
  }
  if (last.ms > SLOW_MS) return { level: 'slow', label: '混み合っています', last }
  const shaky = list.some((s) => now - s.at <= RECENT_MS && (!s.ok || s.ms > SLOW_MS))
  if (shaky) return { level: 'slow', label: '不安定です（さっきまで遅いか失敗していました）', last }
  return { level: 'ok', label: '正常', last }
}

// 「応答 0.4秒・2分前」
export function healthDetail(sample: HealthSample, now: number): string {
  const secs = sample.ms < 100 ? '0.1秒未満' : `${sample.ms < 10_000 ? (sample.ms / 1000).toFixed(1) : Math.round(sample.ms / 1000)}秒`
  const ago = Math.max(0, Math.floor((now - sample.at) / 60_000))
  const when = ago === 0 ? 'たった今' : ago < 60 ? `${ago}分前` : `${Math.floor(ago / 60)}時間前`
  return sample.ok ? `応答 ${secs}・${when}` : `${secs}で失敗・${when}`
}
