// 問い合わせを送る（このサイトの関数 api/feedback.ts が、問い合わせ専用の非公開リポジトリの Issue にする）
export type FeedbackKind = 'bug' | 'idea' | 'question' | 'other'

// 画面の選択肢（api/feedback.ts の FEEDBACK_KINDS と同じ並び・同じ呼び名）
export const FEEDBACK_KIND_LABELS: readonly (readonly [FeedbackKind, string])[] = [
  ['bug', '不具合'],
  ['idea', '要望'],
  ['question', '質問'],
  ['other', 'その他'],
]

export const FEEDBACK_MIN = 5
export const FEEDBACK_MAX = 2000
export const CONTACT_MAX = 100

// 不具合のときに添える、アプリの版と端末の種類（ブラウザの名乗り）。利用者が添えるかどうかを選ぶ
export function deviceSummary(): string {
  return `Anipair ${__APP_VERSION__} / ${navigator.userAgent}`.slice(0, 300)
}

export interface FeedbackDraft {
  kind: FeedbackKind
  body: string
  contact: string
  withDevice: boolean
  // 人には見えない欄（機械の送信を見分ける）
  website: string
}

// 送れたら null、送れなければ利用者に見せる文
export async function sendFeedback(d: FeedbackDraft, fetchFn: typeof fetch = fetch): Promise<string | null> {
  let res: Response
  try {
    res = await fetchFn('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: d.kind,
        body: d.body,
        contact: d.contact.trim() || null,
        device: d.withDevice ? deviceSummary() : null,
        website: d.website,
      }),
    })
  } catch {
    return '送れませんでした。通信の状態を確かめて、もう一度お試しください。'
  }
  if (res.ok) return null
  if (res.status === 429) return '問い合わせが多く、いまは受け付けを止めています。しばらく待ってからお試しください。急ぎのときはX（@anipairAPP）からお知らせください。'
  if (res.status === 503) return 'いまは問い合わせを受け付けていません。お手数ですが、X（@anipairAPP）からお知らせください。'
  if (res.status === 504) return '送れたかどうか確かめられませんでした。届いていることがあるので、すぐに送り直さず、少し待ってからお試しください。'
  if (res.status === 400) return `内容を読み取れませんでした。本文を${FEEDBACK_MIN}〜${FEEDBACK_MAX}字にして、もう一度お試しください。`
  return '送れませんでした。少し待ってから、もう一度お試しください。'
}
