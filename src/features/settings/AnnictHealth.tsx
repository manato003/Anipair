import { useEffect, useState, useSyncExternalStore } from 'react'
import { Spinner } from '../../components/Loading'
import { fetchViewer } from '../../lib/annict'
import { annictHealthSamples, healthDetail, judgeAnnictHealth, subscribeAnnictHealth } from '../../lib/annictHealth'

// Annict の API の調子。URL と色の点（緑・黄・赤。まだ分からなければ灰）と一言で出す。色だけに頼らず、一言でも分かるようにする。
// ふだんの問い合わせの結果から決める。「いま確かめる」を押したときだけ、軽い問い合わせを1回送る
export function AnnictHealth(props: { token: string }) {
  const samples = useSyncExternalStore(subscribeAnnictHealth, annictHealthSamples)
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  // 「〜分前」を進める（届いたばかりの記録は、時刻が先でも「たった今」になる）
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const health = judgeAnnictHealth(samples, now)

  async function check() {
    setChecking(true)
    try {
      await fetchViewer(props.token)
    } catch {
      // 結果は調子の記録に入る（失敗も含めて、ここでは何もしない）
    } finally {
      setChecking(false)
    }
  }

  return (
    // 問い合わせのたびに変わるので、読み上げの対象（role="status"）にはしない
    <div className={`health health--${health.level}`}>
      <span className="health__dot" aria-hidden />
      <span className="health__url">api.annict.com</span>
      <span className="health__label">{health.label}</span>
      {health.last && <span className="health__detail">{healthDetail(health.last, now)}</span>}
      <button type="button" className="link health__check" onClick={check} disabled={checking}>
        {checking && <Spinner />}
        {checking ? '確かめています' : 'いま確かめる'}
      </button>
    </div>
  )
}
