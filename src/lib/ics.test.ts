import { describe, expect, it } from 'vitest'
import { buildCalendar, escapeText, foldLine, googleCalendarUrl } from './ics'

describe('buildCalendar', () => {
  it('writes one event per broadcast in UTC, with CRLF line ends', () => {
    const start = new Date('2026-10-24T14:30:00.000Z') // 日本時間 23:30
    const ics = buildCalendar('Anipair 今週の放送', [{ uid: 'W1-1@anipair.com', start, minutes: 30, summary: '葬送のフリーレン', location: 'TOKYO MX' }], new Date('2026-10-21T00:00:00.000Z'))
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics).toContain('\r\nBEGIN:VEVENT\r\nUID:W1-1@anipair.com\r\nDTSTAMP:20261021T000000Z\r\nDTSTART:20261024T143000Z\r\nDTEND:20261024T150000Z\r\nSUMMARY:葬送のフリーレン\r\nLOCATION:TOKYO MX\r\nEND:VEVENT\r\n')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true)
  })
})

describe('escapeText / foldLine', () => {
  it('escapes backslashes, semicolons, commas and newlines', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne')
  })

  it('folds long lines at 75 bytes without splitting a Japanese character', () => {
    const line = `SUMMARY:${'あ'.repeat(40)}`
    const parts = foldLine(line).split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75)
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line)
  })
})

describe('googleCalendarUrl', () => {
  it('opens Google Calendar’s new-event screen with the title, time (UTC) and channel filled in', () => {
    const url = new URL(googleCalendarUrl({ uid: 'x', start: new Date('2026-10-24T14:30:00.000Z'), minutes: 30, summary: '薬屋のひとりごと 第3期', location: '日本テレビ' }))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe('薬屋のひとりごと 第3期')
    expect(url.searchParams.get('dates')).toBe('20261024T143000Z/20261024T150000Z')
    expect(url.searchParams.get('location')).toBe('日本テレビ')
  })
})
