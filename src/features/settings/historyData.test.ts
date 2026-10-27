import { describe, expect, it } from 'vitest'
import changelogJa from '../../../CHANGELOG.md?raw'
import changelogEn from '../../../CHANGELOG.en.md?raw'
import { briefOf, compareVersions, groupMilestones, localizeEntries, parseChangelog, versionRange } from './historyData'

const RAW = `# 更新履歴

前置き

## v0.3.0 — 2026-10-03

まとめの段落

### 見た目

- 項目A
  - 項目Aの補足
- 項目B \`tiers.json\`

## v0.2.1 — 2026-10-02

- 直し

## v0.1.0 — 2026-10-01

- 始まり
`

const SOURCES = [
  { from: 'v0.1.0', art: 'rate', title: '始まり', summary: '' },
  { from: 'v0.2.0', art: 'data', title: '次', summary: '' },
] as const satisfies Parameters<typeof groupMilestones>[1]

describe('parseChangelog', () => {
  it('splits versions and keeps paragraphs, subheadings and nested items in order', () => {
    const entries = parseChangelog(RAW)
    expect(entries.map((e) => [e.version, e.date])).toEqual([
      ['v0.3.0', '2026-10-03'],
      ['v0.2.1', '2026-10-02'],
      ['v0.1.0', '2026-10-01'],
    ])
    expect(entries[0].blocks).toEqual([
      { kind: 'p', depth: 0, text: 'まとめの段落' },
      { kind: 'h', depth: 0, text: '見た目' },
      { kind: 'li', depth: 0, text: '項目A' },
      { kind: 'li', depth: 1, text: '項目Aの補足' },
      { kind: 'li', depth: 0, text: '項目B `tiers.json`' },
    ])
  })
})

describe('groupMilestones', () => {
  it('puts each version in the latest milestone it has reached, newest milestone first', () => {
    const ms = groupMilestones(parseChangelog(RAW), SOURCES)
    expect(ms.map((m) => [m.title, m.entries.map((e) => e.version)])).toEqual([
      ['次', ['v0.3.0', 'v0.2.1']],
      ['始まり', ['v0.1.0']],
    ])
    expect(versionRange(ms[0], '〜')).toBe('v0.2.1〜v0.3.0')
    expect(versionRange(ms[1], '〜')).toBe('v0.1.0')
  })

  it('compares versions by number, not as text', () => {
    expect(compareVersions('v0.10.0', 'v0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v0.2.0', 'v0.2.0')).toBe(0)
  })
})

describe('briefOf', () => {
  it('uses the lead paragraph when the version has one', () => {
    expect(briefOf(parseChangelog(RAW)[0])).toEqual({ kind: 'lead', text: 'まとめの段落' })
  })

  it('otherwise lists the first sentence of each item', () => {
    const [e] = parseChangelog('## v1.0.0 — 2026-10-01\n\n- 一文目です。二文目です\n  - 補足\n- First one. Second one\n- 句点なし\n')
    expect(briefOf(e)).toEqual({ kind: 'items', items: ['一文目です。', 'First one.', '句点なし'] })
  })
})

describe('localizeEntries', () => {
  it('uses the English entry when there is one, and the Japanese one otherwise', () => {
    const ja = parseChangelog(RAW)
    const en = parseChangelog('## v0.3.0 — 2026-10-03\n\n- Item A\n')
    expect(localizeEntries(ja, en).map((e) => e.blocks[0].text)).toEqual(['Item A', '直し', '始まり'])
    expect(localizeEntries(ja, null)).toBe(ja)
  })
})

// 英語版の CHANGELOG は日本語版と同じ版・同じ日付で書く（無い版は日本語のまま出すが、版や日付が食い違うと別の版に見える）
describe('CHANGELOG.en.md', () => {
  it('has only versions of the Japanese changelog, with the same dates', () => {
    const ja = new Map(parseChangelog(changelogJa).map((e) => [e.version, e.date]))
    for (const e of parseChangelog(changelogEn)) expect([e.version, ja.get(e.version)]).toEqual([e.version, e.date])
  })

  it('starts with the version the app is built as', () => {
    expect(parseChangelog(changelogJa)[0].version).toBe(`v${__APP_VERSION__}`)
  })
})
