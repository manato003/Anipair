export interface ScheduleOptions {
  // true なら裏の仕事。画面の仕事（既定）が1つでも待っているあいだは始まらない
  background?: boolean
  // true なら、ほかの仕事と重ねない（前の仕事がすべて終わってから始め、終わるまで次を始めない）。
  // 書き込みに使う: 頼んだ順に反映し、あとから頼んだ読み込みが書き込みの前の内容を返さないように
  exclusive?: boolean
}

// 外部 API の利用制限を守るため、呼び出しを1本の列に並べ、前の呼び出しの開始から一定の間隔を空ける。
// maxConcurrent: 同時に進めてよい数。間隔は「開始」どうしで空けるので、2以上にしても頼む頻度は増えない
// （答えの遅い1件が、後ろの仕事を全部止めないようにするためのもの）。
// 画面の仕事は、待っている裏の仕事より必ず先に進む（裏の先読みが、表紙の読み込みなどを遅らせないため）。
// すでに始まった仕事は途中で止めない。同じ優先度の中は頼んだ順に始める。失敗した呼び出しがあっても列は止めない
export function createThrottle(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxConcurrent = 1,
) {
  interface Job {
    task: () => Promise<unknown>
    resolve: (value: unknown) => void
    reject: (reason: unknown) => void
    exclusive: boolean
  }
  const foreground: Job[] = []
  const background: Job[] = []
  let running = false
  let last = -Infinity
  // 進めている仕事の数と、そのうち重ねない仕事が進んでいるか
  let active = 0
  let exclusiveActive = false
  // 進めている仕事が1つ終わったら呼ぶ（空きを待っている列を進める）
  let onFree: (() => void) | null = null

  const next = () => foreground[0] ?? background[0]
  const canStart = (job: Job) => !exclusiveActive && (job.exclusive ? active === 0 : active < maxConcurrent)

  async function pump(): Promise<void> {
    try {
      while (foreground.length || background.length) {
        const head = next()
        if (!canStart(head)) {
          await new Promise<void>((r) => (onFree = r))
          continue
        }
        const wait = last + minIntervalMs - now()
        if (wait > 0) {
          await sleep(wait)
          // 待っている間に画面の仕事が来ていることがあるので、取り出す前に確かめ直す
          continue
        }
        const job = foreground.length ? foreground.shift()! : background.shift()!
        last = now()
        active++
        if (job.exclusive) exclusiveActive = true
        // 始めると決めたその時に呼ぶ（間隔は呼んだ時刻どうしで空ける）。呼んだ時点で投げた失敗も、断りとして返す
        let started: Promise<unknown>
        try {
          started = Promise.resolve(job.task())
        } catch (e) {
          started = Promise.reject(e)
        }
        void started
          .then(job.resolve, job.reject)
          .finally(() => {
            active--
            if (job.exclusive) exclusiveActive = false
            const free = onFree
            onFree = null
            free?.()
          })
      }
    } finally {
      running = false
    }
  }

  return function schedule<T>(task: () => Promise<T>, opts: ScheduleOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = { task, resolve: resolve as (v: unknown) => void, reject, exclusive: opts.exclusive === true }
      ;(opts.background ? background : foreground).push(job)
      if (!running) {
        running = true
        // 同じ時点で頼まれた仕事の優先度を比べられるよう、列を回し始めるのは1つ後
        void Promise.resolve().then(pump)
      } else {
        // 空きを待っている列は、いま来た仕事なら始められるかもしれないので起こす（例: 待っていたのが重ねない仕事）
        const free = onFree
        onFree = null
        free?.()
      }
    })
  }
}
