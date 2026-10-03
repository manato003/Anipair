import { genreName } from '../features/match/taste'
import type { Media } from '../lib/shikimori'

// 広い画面だけ、カードの題名の下に出す作品の手がかり（放送時期・形式・制作会社・ジャンル）。
// 「見たかどうか」を思い出す助けにする。データは表紙と同じ問い合わせで取れるものだけ（1枚ごとに問い合わせを増やさない）。
// 狭い画面では CSS で隠す（表紙とボタンに集中させる）
const MAX_TAGS = 6

export function WorkFacts(props: { media: Media | null; head: (string | null | undefined)[]; note?: string | null }) {
  const studios = props.media?.studios.slice(0, 2) ?? []
  const line = [...props.head, studios.length > 0 ? `制作 ${studios.join('・')}` : null].filter((x): x is string => !!x)
  // 「受賞作」は作品の中身の手がかりにならないので出さない（好みの特徴からも外している）
  const tags = [...(props.media?.genres ?? []), ...(props.media?.themes ?? [])].filter((g) => g !== 'Award Winning').slice(0, MAX_TAGS)
  if (line.length === 0 && tags.length === 0 && !props.note) return null
  return (
    <div className="facts">
      {line.length > 0 && <p className="facts__line">{line.join(' · ')}</p>}
      {props.note && <p className="facts__note">{props.note}</p>}
      {tags.length > 0 && (
        <ul className="facts__tags" aria-label="ジャンル">
          {tags.map((g) => (
            <li key={g}>{genreName(g)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
