// 年末のふり返りの知らせ（2026-11-19、Cの案 C3）。
// ふり返りは「まとめ」の一覧の中にあって気づかれにくいので、年末の12月にだけ、記録の画面に一度「〇〇年のふり返りができました」と出す。
// 閉じるか、ふり返りを開いたら、その年はもう出さない（端末ごと。覚えたことを押しつけない: concept.md「利用者への姿勢」）

// 出す年。12月で、その年に「見た」にした作品があり（years は reviewYears の結果）、その年の知らせを済ませていなければ、その年。ほかは null
export function yearNoticeFor(now: Date, years: readonly number[], done: number | null): number | null {
  if (now.getMonth() !== 11) return null
  const year = now.getFullYear()
  return years.includes(year) && done !== year ? year : null
}
