import { Fragment } from 'react'
import { phraseChunks } from '../lib/phrase'

// 日本語を語の途中で折らない表示（語の分け方は lib/phrase.ts）。改行の機会（wbr）は語のまとまりの間にだけ置く
export function Phrase({ text }: { text: string }) {
  const chunks = phraseChunks(text)
  if (chunks.length < 2) return <>{text}</>
  return (
    <span className="phrase">
      {chunks.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {c}
        </Fragment>
      ))}
    </span>
  )
}
