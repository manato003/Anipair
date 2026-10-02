// 外部 API の利用制限を守るため、呼び出しを1本の列に並べ、前の呼び出しから一定の間隔を空ける。
// 失敗した呼び出しがあっても列は止めない
export function createThrottle(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  let chain: Promise<unknown> = Promise.resolve()
  let last = -Infinity

  return function schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = last + minIntervalMs - now()
      if (wait > 0) await sleep(wait)
      last = now()
      return task()
    }
    const result = chain.then(run, run)
    chain = result.catch(() => undefined)
    return result
  }
}
