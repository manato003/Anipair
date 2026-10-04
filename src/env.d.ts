// ビルド時に vite.config.ts の define で埋め込む（package.json の version）
declare const __APP_VERSION__: string
// 実績の God モードを出すか（本番のビルドだけ false。vite.config.ts）
declare const __GOD_MODE__: boolean

interface ImportMetaEnv {
  // Annict のアプリケーションの client_id。ブラウザに埋め込まれる（公開してよい値）。無ければ「Annict でログイン」を出さない
  readonly VITE_ANNICT_CLIENT_ID?: string
}
