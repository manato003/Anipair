// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowStage } from './FlowStage'

afterEach(cleanup)

describe('FlowStage', () => {
  it('shows the last answer with its mark above, the current work in the middle and the next one below', () => {
    const onOpen = vi.fn()
    render(
      <FlowStage
        current={{ key: 'w2', title: '作品2', cover: null, onOpen, info: <p>2026年秋・TV</p> }}
        prev={{ key: 'w1', title: '作品1', cover: null, mark: { label: '見たい', icon: null, strong: true } }}
        next={{ key: 'w3', title: '作品3', cover: null }}
      >
        <button type="button">答え</button>
      </FlowStage>,
    )
    expect(screen.getByRole('heading', { name: '作品2' })).toBeTruthy()
    expect(screen.getByText('作品1')).toBeTruthy()
    expect(screen.getByText('見たい').className).toContain('flow__mark--strong')
    expect(screen.getByText('作品3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '詳しく見る' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '答え' })).toBeTruthy()
  })

  it('shows the placeholder instead of a work while there is none, and a hint where the last answer will go', () => {
    render(
      <FlowStage current={null} placeholder={<p>作品を読み込み中</p>} prev={null} next={null} emptyPrev="答えた候補は、ここに残ります">
        <span />
      </FlowStage>,
    )
    expect(screen.getByText('作品を読み込み中')).toBeTruthy()
    expect(screen.getByText('答えた候補は、ここに残ります')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '詳しく見る' })).toBeNull()
  })
})
