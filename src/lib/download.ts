// 文字のファイルを端末に保存させる（一時的な <a download> を押す。バックアップの書き出し・今週の放送のカレンダー）
export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // すぐ解放すると、ダウンロードが始まる前に消える端末（iOS の Safari など）があるので、少し待つ
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
