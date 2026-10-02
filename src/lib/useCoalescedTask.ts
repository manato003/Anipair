import { useCallback, useRef } from 'react'

// 送信の列に「同じ仕事」を1つだけ並べる。同期は端末の控え全体を読んで書くので、始まる前にもう一度頼まれたら1回にまとめる
// （1回 = GitHub の1コミット）。待ちの印は仕事が始まった瞬間（控えを読む前）に下ろすので、
// 仕事の最中の変更は次の仕事に載る（変更のあとに必ずどれかの仕事が始まる）。
// run が null のとき（GitHub とつないでいないなど）は何もしない。run は useMemo / useCallback で安定させる
export function useCoalescedTask(
  enqueue: (label: string, task: () => Promise<void>) => void,
  label: string,
  run: (() => Promise<void>) | null,
): () => void {
  const waiting = useRef(false)
  return useCallback(() => {
    if (!run || waiting.current) return
    waiting.current = true
    enqueue(label, async () => {
      waiting.current = false
      await run()
    })
  }, [enqueue, label, run])
}
