import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bundles the desktop management UI for the VS Code webview. The only
// difference from the Tauri build: `./nativeRouter` resolves to
// `src/webviewBridge.ts`, which forwards every call to the extension host.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const extensionRoot = resolve(root, 'vscode-extension')
const require = createRequire(resolve(root, 'package.json'))
const { build } = require('esbuild')

const bridgePlugin = {
  name: 'webview-bridge',
  setup(api) {
    api.onResolve({ filter: /^\.\/nativeRouter$/ }, () => ({
      path: resolve(root, 'src', 'webviewBridge.ts'),
    }))
  },
}

await build({
  entryPoints: [resolve(root, 'webview', 'main.tsx')],
  bundle: true,
  outfile: resolve(extensionRoot, 'media', 'manage.js'),
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  minify: true,
  sourcemap: true,
  plugins: [bridgePlugin],
  logLevel: 'info',
})
