import { beforeEach } from 'vitest'
import * as storage from '../lib/storage'

// 端末の保存は、ページを開いたときのトークンと持ち主を覚えて、違えば読み書きを止める（lib/storage.ts の pageIsCurrent）。
// テストは1つのページの中で何度も端末の内容を作り直すので、テストのたびに「開いたばかり」に戻す
// （storage を差し替えたテストでは、この関数が無いことがある）
beforeEach(() => {
  ;(storage as { resetPageForTests?: () => void }).resetPageForTests?.()
})
