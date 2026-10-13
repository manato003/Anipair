import { ChipSection } from './FilterParts'
import { Sheet } from './Sheet'
import { REGIONS, SATELLITES, SERVICES, setBroadcastPrefs, useBroadcastPrefs, type Region } from '../lib/broadcast'

const toggle = <T,>(list: readonly T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
const REGION_ITEMS = REGIONS.map((r) => ({ id: r, label: r }))

// 見るサービスを選ぶ（記録の「見てる」と、設定の「表示」から開く）。選ぶとすぐ保存して効かせる（絞り込みのシートと同じ）
export function BroadcastSheet(props: { onClose: () => void }) {
  const prefs = useBroadcastPrefs()
  return (
    <Sheet label="見るサービス" onClose={props.onClose}>
      <h2 className="detail__title">見るサービス</h2>
      <p className="note">選んだサービスで、記録の「見てる」の作品に次の放送日を出します。放送予定は、Annictに登録された情報です。</p>
      <ChipSection
        title="配信"
        items={SERVICES}
        selected={prefs.services}
        onToggle={(id) => setBroadcastPrefs({ ...prefs, services: toggle(prefs.services, id) })}
      />
      {/* 地上波は地域で局が違うので、1つだけ選ぶ（もう一度押すと外す） */}
      <ChipSection
        title="地上波（地域）"
        items={REGION_ITEMS}
        selected={prefs.region ? [prefs.region] : []}
        onToggle={(id: Region) => setBroadcastPrefs({ ...prefs, region: prefs.region === id ? null : id })}
      />
      <ChipSection
        title="BS・CS"
        items={SATELLITES}
        selected={prefs.satellites}
        onToggle={(id) => setBroadcastPrefs({ ...prefs, satellites: toggle(prefs.satellites, id) })}
      />
      <div className="filtersheet__foot">
        <button type="button" className="btn btn--primary" onClick={props.onClose}>
          決める
        </button>
      </div>
    </Sheet>
  )
}
