import { beforeEach } from 'vitest'
import * as storage from '../lib/storage'
import { resetLangForTests } from '../lib/i18n'
import { resetEnglishTitlesForTests } from '../lib/englishTitles'

// テストのファイルを読み込む前にも日本語にしておく（読み込んだときに言語を見る所があっても、日本語で始まるように）
resetLangForTests()

// 端末の保存は、ページを開いたときのトークンと持ち主を覚えて、違えば読み書きを止める（lib/storage.ts の pageIsCurrent）。
// テストは1つのページの中で何度も端末の内容を作り直すので、テストのたびに「開いたばかり」に戻す
// （storage を差し替えたテストでは、この関数が無いことがある）
beforeEach(() => {
  ;(storage as { resetPageForTests?: () => void }).resetPageForTests?.()
  // jsdom のブラウザの言語は英語なので、言語はテストのたびに日本語へ戻す（英語の画面は、そのテストの中で切り替える）
  resetLangForTests()
  // 覚えた公式の英題も、テストごとに空にする
  resetEnglishTitlesForTests()
})
