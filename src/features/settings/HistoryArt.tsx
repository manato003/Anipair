import type { ReactNode } from 'react'
import type { HistoryArt as ArtKind } from './historyData'

// 「開発記録」の節目の図。16:9 の画面の枠に、文字の色の線だけで描く（地の色が季節で変わっても馴染むように）。
// 線画は見本の HTML から写した
const label = (x: number, y: number, size: number, text: string, bold = false) => (
  <text x={x} y={y} fontSize={size} textAnchor="middle" fill="currentColor" stroke="none" fontWeight={bold ? 700 : undefined}>
    {text}
  </text>
)

const ART: Record<ArtKind, () => ReactNode> = {
  rate: () => (
    <>
      <rect x="62" y="6" width="36" height="42" rx="4" />
      {[30, 56, 82, 108].map((x) => (
        <rect key={x} x={x} y="56" width="22" height="12" rx="3" />
      ))}
      <rect x="30" y="73" width="46" height="11" rx="3" />
      <rect x="82" y="73" width="48" height="11" rx="3" fill="currentColor" fillOpacity=".25" />
    </>
  ),
  data: () => (
    <>
      <rect x="8" y="30" width="42" height="28" rx="4" />
      {label(29, 48, 10, 'Annict')}
      <rect x="110" y="30" width="44" height="28" rx="4" />
      {label(132, 48, 9, 'Shikimori')}
      <circle cx="80" cy="44" r="13" fill="currentColor" fillOpacity=".2" />
      <path d="M50 40h15M95 40h15M65 48H50M110 48H95" />
      <path d="M60 37l5 3-5 3M100 37l-5 3 5 3" />
    </>
  ),
  thumb: () => (
    <>
      <rect x="56" y="4" width="48" height="82" rx="8" />
      <rect x="62" y="10" width="36" height="30" rx="3" />
      <rect x="62" y="46" width="36" height="7" rx="2" />
      <rect x="62" y="57" width="17" height="10" rx="2" />
      <rect x="81" y="57" width="17" height="10" rx="2" />
      <rect x="62" y="70" width="36" height="11" rx="3" fill="currentColor" fillOpacity=".25" />
      <path d="M140 86c-6-20-18-28-34-14" strokeDasharray="4 4" />
    </>
  ),
  medal: () => (
    <>
      <circle cx="50" cy="38" r="17" />
      <path d="M50 28l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7-5.5-4.5 7-.5z" fill="currentColor" fillOpacity=".3" />
      <path d="M41 53l-5 26 14-8 14 8-5-26" />
      <path d="M94 22c10-4 20-4 26 2 6-6 16-6 26-2v52c-10-4-20-4-26 2-6-6-16-6-26-2z" />
      <path d="M120 24v52M101 36h13M101 46h13M127 36h13M127 46h13" />
    </>
  ),
  episodes: () => (
    <>
      {[2, 3, 1, 3].map((filled, i) => (
        <g key={i}>
          <text x="12" y={20 + i * 19} fontSize="10" fill="currentColor" stroke="none">
            {`#${i + 1}`}
          </text>
          {[0, 1, 2, 3].map((j) => (
            <circle key={j} cx={70 + j * 16} cy={16 + i * 19} r="5" fill={j <= filled ? 'currentColor' : 'none'} fillOpacity={j <= filled ? '.55' : undefined} />
          ))}
        </g>
      ))}
    </>
  ),
  season: () => (
    <>
      <path d="M80 45V8a37 37 0 0 1 37 37z" fill="currentColor" fillOpacity=".12" />
      <path d="M80 45h37a37 37 0 0 1-37 37z" fill="currentColor" fillOpacity=".32" />
      <path d="M80 45v37a37 37 0 0 1-37-37z" fill="currentColor" fillOpacity=".55" />
      <path d="M80 45H43A37 37 0 0 1 80 8z" fill="currentColor" fillOpacity=".8" />
      <circle cx="80" cy="45" r="37" />
    </>
  ),
  mascot: () => (
    <>
      <ellipse cx="62" cy="58" rx="30" ry="24" />
      <path d="M52 34l-8-18M70 34l8-18" />
      <circle cx="53" cy="56" r="2.5" fill="currentColor" />
      <circle cx="71" cy="56" r="2.5" fill="currentColor" />
      <path d="M58 64q4 3 8 0" />
      <ellipse cx="112" cy="64" rx="21" ry="17" />
      <path d="M112 47v-9M112 40q-8-6-12 0q6 4 12 0q8-6 12 0q-6 4-12 0" />
      <circle cx="105" cy="63" r="2.2" fill="currentColor" />
      <circle cx="119" cy="63" r="2.2" fill="currentColor" />
      <path d="M109 70q3 2 6 0" />
    </>
  ),
  mail: () => (
    <>
      <path d="M18 16h70a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H44l-14 12v-12H18a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8z" />
      {label(53, 43, 18, '?')}
      <rect x="104" y="40" width="46" height="32" rx="4" />
      <path d="M104 44l23 16 23-16" />
    </>
  ),
  lang: () => (
    <>
      {/* 日本語と英語の2つの文字を並べた図（英語の画面でも「あ」のまま） */}
      {label(48, 60, 40, 'あ', true) /* i18n-ok */}
      {label(114, 60, 40, 'A', true)}
      <path d="M70 72h22M74 68l-4 4 4 4M88 68l4 4-4 4" />
    </>
  ),
  tier: () => (
    <>
      {['S', 'A', 'B'].map((l, i) => (
        <g key={l}>
          <rect x="10" y={8 + i * 26} width="22" height="22" rx="3" fill="currentColor" fillOpacity={0.75 - i * 0.22} />
          <text x="21" y={24 + i * 26} fontSize="12" textAnchor="middle" className="history-art__on-ink" stroke="none" fontWeight={700}>
            {l}
          </text>
          {Array.from({ length: [4, 3, 5][i] }, (_, j) => (
            <rect key={j} x={38 + j * 22} y={8 + i * 26} width="16" height="22" rx="2" />
          ))}
        </g>
      ))}
    </>
  ),
}

export function HistoryArt({ kind }: { kind: ArtKind }) {
  return (
    <div className="history-art" aria-hidden>
      <svg viewBox="0 0 160 90" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ART[kind]()}
      </svg>
    </div>
  )
}
