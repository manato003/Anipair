import { ChipSection } from './FilterParts'
import { Sheet } from './Sheet'
import { t } from '../lib/i18n'
import { type Region, regionLabel, REGIONS, SATELLITES, SERVICES, setBroadcastPrefs, useBroadcastPrefs } from '../lib/broadcast'

const toggle = <T,>(list: readonly T[], id: T): T[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
// 地域の英語名（REGIONS と同じ並び。id は日本語のまま保存されるので、表示の名前だけ替える）
const regionItems = () => REGIONS.map((r) => ({ id: r, label: regionLabel(r) }))

// 見るサービスを選ぶ（記録の「見てる」と、設定の「表示」から開く）。選ぶとすぐ保存して効かせる（絞り込みのシートと同じ）
export function BroadcastSheet(props: { onClose: () => void }) {
  const prefs = useBroadcastPrefs()
  return (
    <Sheet label={t('見るサービス', 'Where I watch')} onClose={props.onClose}>
      <h2 className="detail__title">{t('見るサービス', 'Where I watch')}</h2>
      <p className="note">
        {t(
          '選んだサービスで、記録の「見てる」の作品に次の放送日を出します。',
          'Next air dates appear on the anime under Watching in Records, based on the services you pick.',
        )}
      </p>
      <ChipSection
        title={t('配信', 'Streaming')}
        items={SERVICES}
        selected={prefs.services}
        onToggle={(id) => setBroadcastPrefs({ ...prefs, services: toggle(prefs.services, id) })}
      />
      {/* 地上波は地域で局が違うので、1つだけ選ぶ（もう一度押すと外す） */}
      <ChipSection
        title={t('地上波（地域）', 'Broadcast TV (region)')}
        items={regionItems()}
        selected={prefs.region ? [prefs.region] : []}
        onToggle={(id: Region) => setBroadcastPrefs({ ...prefs, region: prefs.region === id ? null : id })}
      />
      <ChipSection
        title={t('BS・CS', 'BS/CS satellite')}
        items={SATELLITES}
        selected={prefs.satellites}
        onToggle={(id) => setBroadcastPrefs({ ...prefs, satellites: toggle(prefs.satellites, id) })}
      />
      <div className="filtersheet__foot">
        <button type="button" className="btn btn--primary" onClick={props.onClose}>
          {t('完了', 'Done')}
        </button>
      </div>
    </Sheet>
  )
}
