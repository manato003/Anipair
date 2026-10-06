import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf-8')

// 本番の Content-Security-Policy（vercel.json）。jsdom のテストは CSP を効かせないので、アプリが使う読み込み先が許されているかをここで確かめる
function directive(name: string): string[] {
  const config = JSON.parse(read('vercel.json')) as { headers: { headers: { key: string; value: string }[] }[] }
  const csp = config.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
  const part = csp.split(';').map((s) => s.trim().split(/\s+/)).find(([n]) => n === name)
  return part ? part.slice(1) : []
}

describe('Content-Security-Policy', () => {
  // 2026-10-06 の点検: 共有の画像のプレビュー（URL.createObjectURL の blob: を <img> に出す）が、本番だけ映っていなかった
  it('allows blob: images, used by the share preview', () => {
    expect(read('src/features/share/ShareSheet.tsx')).toContain('URL.createObjectURL')
    expect(directive('img-src')).toContain('blob:')
  })
})
