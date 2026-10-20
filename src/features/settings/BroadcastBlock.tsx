import { useState } from 'react'
import { BroadcastSheet } from '../../components/BroadcastSheet'
import { choiceSummary, useBroadcastPrefs } from '../../lib/broadcast'
import { t } from '../../lib/i18n'
import { Section, SettingRow } from './Section'

// 見るサービス（Issue #32）。記録の「見てる」からも同じシートを開ける
export function BroadcastBlock() {
  const prefs = useBroadcastPrefs()
  const [open, setOpen] = useState(false)
  return (
    <Section id="settings-broadcast">
      <SettingRow label={t('見るサービス', 'Where I watch')} hint={t(`見てる作品に次の放送日を出します（${choiceSummary(prefs)}）`, `Shows the next air date for anime you’re watching (${choiceSummary(prefs)})`)}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          {t('選ぶ', 'Choose')}
        </button>
      </SettingRow>
      {open && <BroadcastSheet onClose={() => setOpen(false)} />}
    </Section>
  )
}
