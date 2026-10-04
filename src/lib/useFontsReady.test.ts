// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { textByFont } from './useFontsReady'

describe('textByFont', () => {
  it('collects each character once per font, including text that is not displayed', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <p style="font-weight: 700; font-family: Zen">見出し</p>
      <div style="display: none">
        <p style="font-weight: 400; font-family: Zen">あらすじ、あら</p>
        <span style="font-weight: 700; font-family: Zen">出口</span>
      </div>
      <p>   </p>`
    document.body.append(root)
    const groups = textByFont(root)
    root.remove()
    const byWeight = new Map([...groups].map(([font, text]) => [font.split(' ')[1], { font, text }]))
    expect(byWeight.get('700')?.text).toBe('見出し口')
    expect(byWeight.get('400')?.text).toBe('あらすじ、')
    expect(byWeight.get('700')?.font).toContain('Zen')
    expect(groups.size).toBe(2)
  })
})
