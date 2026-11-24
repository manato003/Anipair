import { Loading } from './Loading'
import { libraryLoadingLabel, libraryRemaining, useLibraryProgress } from '../lib/useLibraryProgress'

// Annict の記録を読んでいるあいだの読み込み中。記録が多ければ「Annictの記録を読み込み中 600 / 1,905」と残り時間を出す。
// 進みが分からないあいだは fallback（無ければ「Annictの記録を読み込み中」）
export function LibraryLoading(props: { fallback?: string; block?: boolean; delay?: number; mark?: boolean; className?: string }) {
  const p = useLibraryProgress()
  return (
    <Loading
      label={p ? libraryLoadingLabel(p) : (props.fallback ?? libraryLoadingLabel())}
      remaining={libraryRemaining(p)}
      block={props.block}
      delay={props.delay}
      mark={props.mark}
      className={props.className}
    />
  )
}
