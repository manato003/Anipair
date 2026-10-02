import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 画面の「このアプリについて」に出す版。package.json の version をビルド時に埋め込む
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    // 既定は node（純粋関数のテストが大半で、DOM の起動は遅い）。
    // DOM が要るテストはファイル先頭に `// @vitest-environment jsdom` を書く。
    environment: 'node',
    // api/ は Vercel の関数なので、テストは api/ の外（tests/）に置く（api/ の中に置くと関数として配備されてしまう）
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    // CSS を実際に読み込ませる。既定ではスタブ化されて ?raw が空文字になり、
    // スタイルシートのカスケードを検証するテストが書けない
    css: true,
  },
})
