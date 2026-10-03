// シートと、スマホの「戻る」（Android の戻るボタン・iOS の PWA のスワイプ・ブラウザの戻る）をつなぐ。
// 何もしないと、シートを開いたまま「戻る」を押すとアプリごと前のページへ出てしまう。
//
// 決まり
// - 開いているシート1つにつき、履歴を1つ積む（同じアドレスで state に { anipairSheet: id } を付ける）
// - 利用者が「戻る」を押して、その履歴を抜けたら、そのシートを閉じる。重なっているときは、いちばん上のシートだけ
// - ボタン・背景・Esc などでシートが閉じたら、積んだ履歴がまだいまの位置なら history.back() で戻す。
//   そのとき出る popstate は自分で起こしたものなので、シートを閉じる合図としては扱わない
// - 履歴を積むのは「開いていて、表示されている画面にある」シートだけ（Sheet の active）。
//   隠れたタブに開いたまま残っているシートは、履歴を持たない（表示中の画面で「戻る」を押したら、見えているシートが閉じる）。
//   シートが非表示になったら、静かに履歴を戻す（シートは開いたまま）。また表示されたら積み直す。
//   つまり「履歴の項目があるのは、開いていて表示されているシートだけ」
// - 閉じる処理は、次のマイクロタスクまで遅らせる。React の StrictMode は、開発時に効果を「付ける → 外す → 付ける」と続けて動かすので、
//   外した直後に同じシートが付け直されたら、何もしなかったことにする（履歴を余計に積まない・すぐ閉じない）

interface Entry {
  id: string
  close: () => void
  // 外されたあと、まだ付け直されていない（遅らせた片付けの待ち）
  pending: boolean
}

// 開いているシート。積んだ順（いちばん上が最後）
const stack: Entry[] = []

// 自分で history.back() を呼んだ数だけ、そのあとの popstate を無視する。来なかったときに次の「戻る」を飲み込まないよう、一定時間で捨てる
const expectedBacks: ReturnType<typeof setTimeout>[] = []
const EXPECT_TIMEOUT_MS = 1000

let listening = false

const STATE_KEY = 'anipairSheet'

// いまの履歴の項目が、どのシートのものか（シートの項目でなければ null）
function currentSheetId(): string | null {
  const state: unknown = window.history.state
  if (state && typeof state === 'object' && STATE_KEY in state) {
    const id = (state as Record<string, unknown>)[STATE_KEY]
    return typeof id === 'string' ? id : null
  }
  return null
}

function goBack(): void {
  const timer = setTimeout(() => {
    const i = expectedBacks.indexOf(timer)
    if (i >= 0) expectedBacks.splice(i, 1)
  }, EXPECT_TIMEOUT_MS)
  expectedBacks.push(timer)
  window.history.back()
}

function onPopState(): void {
  const mine = expectedBacks.shift()
  if (mine !== undefined) {
    // 自分で戻した分。閉じる合図ではない
    clearTimeout(mine)
  } else {
    // 利用者の「戻る」。いまの位置にあるシートより上（あとから積んだ）ものを、上から閉じる。
    // いまの位置がシートの項目でなければ、すべて閉じる
    const id = currentSheetId()
    const keep = id === null ? 0 : stack.findIndex((e) => e.id === id) + 1
    for (const entry of stack.splice(keep).reverse()) entry.close()
  }
  // もう開いていないシートの項目に着いたら（重なったシートを同時に閉じて取り残したもの・進むで戻ったもの）、さらに1つ戻って飛ばす
  const here = currentSheetId()
  if (here !== null && !stack.some((e) => e.id === here)) goBack()
}

function ensureListening(): void {
  if (listening) return
  listening = true
  window.addEventListener('popstate', onPopState)
}

// シートが開いて（表示されて）いるあいだ呼ぶ。戻り値は、閉じた・隠れたときに呼ぶ後始末。
// close は「戻る」で閉じるとき（シートの onClose）。同じ id で付け直したときは、新しい close に差し替えるだけで履歴は積まない
export function registerSheet(id: string, close: () => void): () => void {
  ensureListening()
  let entry = stack.find((e) => e.id === id)
  if (entry) {
    entry.pending = false
    entry.close = close
  } else {
    try {
      window.history.pushState({ [STATE_KEY]: id }, '')
    } catch {
      // 履歴に積めない環境では、「戻る」で閉じる機能だけ無くなる（ボタンと Esc では閉じられる）
      return () => undefined
    }
    entry = { id, close, pending: false }
    stack.push(entry)
  }
  const mine = entry
  return () => {
    mine.pending = true
    queueMicrotask(() => {
      if (!mine.pending) return
      const i = stack.indexOf(mine)
      // 「戻る」で閉じたあとなら、もう履歴から抜けている
      if (i < 0) return
      stack.splice(i, 1)
      // 積んだ項目がいまの位置にあるときだけ戻す。ほかのシートの下に残った項目は、あとで飛ばされる
      if (currentSheetId() === mine.id) goBack()
    })
  }
}
