import { readFileSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Connect } from 'vite'
import { loadEnv } from 'vite'
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
      // 書き込み（POST ?op=link）は本文も渡す
      const chunks: Buffer[] = []
      if (req.method === 'POST') for await (const chunk of req) chunks.push(chunk as Buffer)
      const out = await handleShiki(new Request(url, { method: req.method, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }))
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

type FeedbackModule = { handleFeedback: (request: Request, env: Record<string, string | undefined>) => Promise<Response> }

// `npm run dev` で /api/feedback を動かす（問い合わせのフォームの確かめ用）。本番の関数と同じ api/feedback.ts の handleFeedback を使う。
// トークンは .env.local の FEEDBACK_GITHUB_TOKEN・FEEDBACK_REPO から読む（無ければ「まだ使えません」を返す）。ビルドの成果物には入らない
function feedbackDevProxy(): Plugin {
  return {
    name: 'feedback-dev-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), 'FEEDBACK_')
      server.middlewares.use('/api/feedback', async (req, res, next) => {
        try {
          const { handleFeedback } = (await server.ssrLoadModule('/api/feedback.ts')) as FeedbackModule
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const out = await handleFeedback(
            new Request(`http://${req.headers.host}/api/feedback`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }),
            env,
          )
          res.statusCode = out.status
          out.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await out.arrayBuffer()))
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

type TierModule = {
  handleTier: (request: Request, deps: { store: unknown }) => Promise<Response>
  memoryStore: () => unknown
}

// `npm run dev` と `npm run preview` で /api/tier（Tier表の共有のリンク）を動かす。本番の関数と同じ api/tier.ts の handleTier を使う。
// 置き場所はサーバーの中だけ（止めると消える）。本番の Upstash は Shikimori の中継の控えと同じデータベースなので、手元からは書かない。
// /t/<ID> の HTML は、vite の SPA の扱いで index.html がそのまま返る（題名と OGP の差し込みは本番の関数だけ）。ビルドの成果物には入らない
function tierDevProxy(): Plugin {
  let store: unknown = null
  const middleware = (load: () => Promise<TierModule>) => async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      const { handleTier, memoryStore } = await load()
      store ??= memoryStore()
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const hasBody = req.method === 'POST' || req.method === 'PUT'
      const out = await handleTier(
        new Request(`http://${req.headers.host}${req.originalUrl ?? req.url ?? '/'}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined }),
        { store },
      )
      res.statusCode = out.status
      out.headers.forEach((value, key) => res.setHeader(key, value))
      res.end(Buffer.from(await out.arrayBuffer()))
    } catch (e) {
      next(e)
    }
  }
  return {
    name: 'tier-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/tier', middleware(() => server.ssrLoadModule('/api/tier.ts') as Promise<TierModule>))
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/tier', middleware(() => import(pathToFileURL(resolve('api/tier.ts')).href) as Promise<TierModule>))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), shikiDevProxy(), feedbackDevProxy(), tierDevProxy()],
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
    // テストのたびに、端末の保存の「開いたばかりのページ」に戻す（lib/storage.ts の pageIsCurrent）
    setupFiles: ['src/test/setup.ts'],
    // CSS を実際に読み込ませる。既定ではスタブ化されて ?raw が空文字になり、
    // スタイルシートのカスケードを検証するテストが書けない
    css: true,
  },
})
