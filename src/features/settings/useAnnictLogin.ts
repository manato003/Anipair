import { useEffect, useRef, useState } from 'react'
import { completeLogin, hasCallback, withoutCallback } from '../../lib/annictLogin'

// 開いたアドレスが「Annict でログイン」から戻ってきたものなら、ここで受け取りを済ませる（App が1回だけ呼ぶ）。
// 結果は、トークンを onToken に渡すか、最初の画面に出すエラーのどちらか
export function useAnnictLogin(onToken: (token: string) => void): { busy: boolean; error: string | null; clearError: () => void } {
  // 戻ってきたアドレスなら、最初の描画から「ログインしています…」を出す
  const [busy, setBusy] = useState(() => hasCallback(window.location.search))
  const [error, setError] = useState<string | null>(null)
  // StrictMode は効果を2回走らせる。code は1回しか使えないので、受け取りは1回だけにする
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    const { pathname, search, hash } = window.location
    if (!hasCallback(search)) return
    started.current = true
    // code を履歴に残さない。先にアドレスを直し、受け取りはいま読んだ search で行う
    window.history.replaceState(null, '', withoutCallback(pathname, search, hash))
    void completeLogin({ search, origin: window.location.origin }).then((result) => {
      if (result.kind === 'token') {
        // 保存は App が、持ち主の名前を確かめて記録を入れ替えるのと一度にする
        onToken(result.token)
      } else {
        setError(result.message)
      }
      setBusy(false)
    })
  }, [onToken])

  return { busy, error, clearError: () => setError(null) }
}
