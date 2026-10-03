// Annict が 401 を返した（トークンが使えない）ことを、アプリ全体に知らせる。
// 呼び出した画面には今までどおり例外で返し、それとは別に、ここへ聞き耳を立てた側（上の帯など）にも届ける。
// window のイベントではなく、このモジュールの中の一覧で持つ（テストしやすく、画面の外からも使える）

// token は失敗したトークン。いまのトークンと比べて、ログインし直したあとに遅れて届いた古い要求の失敗を無視するのに使う
type Listener = (token: string) => void

const listeners = new Set<Listener>()

// 戻り値は聞き耳を外す関数
export function onAnnictAuthFailed(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitAnnictAuthFailed(token: string): void {
  for (const l of [...listeners]) {
    try {
      l(token)
    } catch {
      // 1つの聞き手の失敗で、ほかの聞き手や元のエラーを止めない
    }
  }
}
