import { GitHubError, readJson, writeJson, type GithubConnection } from './github'

// GitHub の JSON と端末の控えを合わせて、両方を同じにする（パスと「見てない」で共通）。
// 他の端末と同時に書いたら取り直して合わせ直す（3回まで）
export interface SyncSpec<T> {
  path: string
  parse: (value: unknown) => T
  merge: (remote: T, local: T) => T
  same: (a: T, b: T) => boolean
  serialize: (value: T) => unknown
  loadLocal: () => T
  saveLocal: (value: T) => void
  // コミットメッセージ
  message: (value: T) => string
}

export async function syncJson<T>(conn: GithubConnection, spec: SyncSpec<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await readJson(conn, spec.path)
    const remoteValue = spec.parse(remote.value)
    const merged = spec.merge(remoteValue, spec.loadLocal())
    spec.saveLocal(merged)
    if (remote.sha && spec.same(merged, remoteValue)) return merged
    try {
      await writeJson(conn, spec.path, spec.serialize(merged), remote.sha, spec.message(merged))
      return merged
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'conflict') continue
      throw e
    }
  }
  throw new GitHubError('他の端末との同期が続けて衝突しました。少し待ってからもう一度試してください', 'conflict')
}
