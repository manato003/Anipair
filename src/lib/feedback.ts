import { t, tx, type Text } from './i18n'

// 問い合わせを送る（このサイトの関数 api/feedback.ts が、問い合わせ専用の非公開リポジトリの Issue にする）
export type FeedbackKind = 'bug' | 'idea' | 'question' | 'other'

// 画面の選択肢（api/feedback.ts の FEEDBACK_KINDS と同じ並び・同じ呼び名）
// 2つめ（呼び名）は取り出したときの言語で返す（組の形は変えない。ファイルの外側で t() を呼ばないため）
function kindLabel(kind: FeedbackKind, text: Text): readonly [FeedbackKind, string] {
  const pair: [FeedbackKind, string] = [kind, text.ja]
  Object.defineProperty(pair, 1, { get: () => tx(text), enumerable: true })
  return pair
}
export const FEEDBACK_KIND_LABELS: readonly (readonly [FeedbackKind, string])[] = [
  kindLabel('bug', { ja: '不具合', en: 'Bug' }),
  kindLabel('idea', { ja: '要望', en: 'Feature request' }),
  kindLabel('question', { ja: '質問', en: 'Question' }),
  kindLabel('other', { ja: 'その他', en: 'Other' }),
]

export const FEEDBACK_MIN = 5
export const FEEDBACK_MAX = 2000
export const CONTACT_MAX = 100

// 不具合のときに添える、アプリの版と端末の種類（ブラウザの名乗り）。利用者が添えるかどうかを選ぶ
function deviceSummary(): string {
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
    return t('送れませんでした。通信の状態を確かめて、もう一度お試しください。', 'Couldn’t send. Check your connection and try again.')
  }
  if (res.ok) return null
  if (res.status === 429) return t(
      '問い合わせが多く、いまは受け付けを止めています。しばらく待ってからお試しください。急ぎのときはX（@anipairAPP）からお知らせください。',
      'We’re getting a lot of messages and have paused intake for now. Please try again in a while, or message us on X (@anipairAPP) if it’s urgent.',
    )
  if (res.status === 503) return t('いまは問い合わせを受け付けていません。お手数ですが、X（@anipairAPP）からお知らせください。', 'We’re not accepting messages right now. Please message us on X (@anipairAPP) instead.')
  if (res.status === 504) return t(
      '送れたかどうか確かめられませんでした。届いていることがあるので、すぐに送り直さず、少し待ってからお試しください。',
      'We couldn’t confirm whether it was sent. It may have arrived, so please wait a moment before sending it again.',
    )
  if (res.status === 400) return t(
      `内容を読み取れませんでした。本文を${FEEDBACK_MIN}〜${FEEDBACK_MAX}字にして、もう一度お試しください。`,
      `We couldn’t read your message. Please make it ${FEEDBACK_MIN} to ${FEEDBACK_MAX} characters and try again.`,
    )
  return t('送れませんでした。少し待ってから、もう一度お試しください。', 'Couldn’t send. Please wait a moment and try again.')
}
