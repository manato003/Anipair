import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Connect } from 'vite'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

// 画面の「このアプリについて」に出す版。package.json の version をビルド時に埋め込む
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

type ShikiModule = { handleShiki: (request: Request) => Promise<Response> }

// `npm run dev` と `npm run preview` で /api/shiki を動かす（Vercel の関数は vite の開発サーバーには無いので、同じ処理を中継の形で差し込む）。
// 処理そのものは api/shiki.ts の handleShiki を使うので、本番の関数と同じ挙動になる。ビルドの成果物には入らない
function shikiDevProxy(): Plugin {
  const middleware = (load: () => Promise<ShikiModule>) => async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      const { handleShiki } = await load()
      const url = new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost')
      const out = await handleShiki(new Request(url, { method: req.method }))
      res.statusCode = out.status
      out.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await out.arrayBuffer()))
    } catch (e) {
      next(e)
    }
  }
  return {
    name: 'shiki-dev-proxy',
    configureServer(server) {
      // 開発サーバーは TypeScript をそのまま読める（書き換えると次の問い合わせから反映される）
      server.middlewares.use('/api/shiki', middleware(() => server.ssrLoadModule('/api/shiki.ts') as Promise<ShikiModule>))
    },
    configurePreviewServer(server) {
      // preview はビルド済みの確認用。Node が TypeScript を直接読む（api/shiki.ts は型を消すだけで動く書き方だけにしてある）
      server.middlewares.use('/api/shiki', middleware(() => import(pathToFileURL(resolve('api/shiki.ts')).href) as Promise<ShikiModule>))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), shikiDevProxy()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // 実績の「God モード」（すべての称号を手に入れた状態で並べる試し表示）を出すか。本番（Vercel の production）のビルドだけ出さない
    __GOD_MODE__: JSON.stringify(process.env.VERCEL_ENV !== 'production'),
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
