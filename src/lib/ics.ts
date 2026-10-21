// カレンダーのファイル（iCalendar、RFC 5545）。今週の放送を、Google カレンダーや iPhone のカレンダーに入れられるように書き出す。
// 時刻は UTC（末尾の Z）で書く。カレンダーの側が端末の時間帯（日本なら日本時間）で出す（時間帯の定義を持たずに済む）

export interface CalendarEvent {
  // 同じ放送を2回入れても重ならないように、放送ごとに決まる ID
  uid: string
  start: Date
  minutes: number
  summary: string
  location?: string
  description?: string
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// 文字の値の中の \ ; , 改行は、決まりどおりに逃がす
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// 1行は75バイトまで。超える分は、改行と空白1つで続ける（日本語の文字を途中で割らない）
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    if (bytes + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function buildCalendar(name: string, events: readonly CalendarEvent[], now: Date): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Anipair//Week//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utc(now)}`,
      `DTSTART:${utc(e.start)}`,
      `DTEND:${utc(new Date(e.start.getTime() + e.minutes * 60_000))}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

// Google カレンダーの「予定を作る」画面を、中身を入れた状態で開くリンク（1件ずつ。ファイルを保存させずに済む。PC 向け）
export function googleCalendarUrl(e: CalendarEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.summary, dates: `${utc(e.start)}/${utc(end)}` })
  if (e.location) q.set('location', e.location)
  if (e.description) q.set('details', e.description)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}
