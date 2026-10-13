import { useState } from 'react'
import { BroadcastSheet } from '../../components/BroadcastSheet'
import { choiceSummary, useBroadcastPrefs } from '../../lib/broadcast'
import { Section, SettingRow } from './Section'

// 見るサービス（Issue #32）。記録の「見てる」からも同じシートを開ける
export function BroadcastBlock() {
  const prefs = useBroadcastPrefs()
  const [open, setOpen] = useState(false)
  return (
    <Section id="settings-broadcast">
      <SettingRow label="見るサービス" hint={`見てる作品に次の放送日を出します（${choiceSummary(prefs)}）`}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          選ぶ
        </button>
      </SettingRow>
      {open && <BroadcastSheet onClose={() => setOpen(false)} />}
    </Section>
  )
}
