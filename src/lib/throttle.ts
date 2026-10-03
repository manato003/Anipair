export interface ScheduleOptions {
  // true なら裏の仕事。画面の仕事（既定）が1つでも待っているあいだは始まらない
  background?: boolean
}

// 外部 API の利用制限を守るため、呼び出しを1本の列に並べ、前の呼び出しの開始から一定の間隔を空ける。
// 画面の仕事は、待っている裏の仕事より必ず先に進む（裏の先読みが、表紙の読み込みなどを遅らせないため）。
// すでに始まった仕事は途中で止めない。同じ優先度の中は頼んだ順。失敗した呼び出しがあっても列は止めない
export function createThrottle(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  interface Job {
    task: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
  }
  const foreground: Job[] = []
  const background: Job[] = []
  let running = false
  let last = -Infinity

  async function pump(): Promise<void> {
    try {
      while (foreground.length || background.length) {
        const wait = last + minIntervalMs - now()
        if (wait > 0) await sleep(wait)
        // 待っている間に画面の仕事が来ていることがあるので、取り出すのは待ったあと
        const job = foreground.shift() ?? background.shift()
        if (!job) continue
        last = now()
        try {
          job.resolve(await job.task())
        } catch (e) {
          job.reject(e)
        }
      }
    } finally {
      running = false
    }
  }

  return function schedule<T>(task: () => Promise<T>, opts: ScheduleOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { task, resolve: resolve as (v: unknown) => void, reject }
      ;(opts.background ? background : foreground).push(job)
      if (!running) {
        running = true
        // 同じ時点で頼まれた仕事の優先度を比べられるよう、列を回し始めるのは1つ後
        void Promise.resolve().then(pump)
      }
    })
  }
}
