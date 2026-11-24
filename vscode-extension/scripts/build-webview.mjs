import { rename } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Bundles the desktop management UI for the VS Code webview with the root
// project's Vite. The only difference from the Tauri build: `./nativeRouter`
// resolves to `src/webviewBridge.ts`, which forwards every call to the
// extension host.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const extensionRoot = resolve(root, 'vscode-extension')
const require = createRequire(resolve(root, 'package.json'))
const { build } = require('vite')
const react = require('@vitejs/plugin-react')

await build({
  configFile: false,
  root,
  plugins: [react.default ? react.default() : react()],
  define: {
    // The bundle runs in a VS Code webview, not Node; library mode does not
    // inject these by default and React reads NODE_ENV at module scope.
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
  },
  resolve: {
    alias: [{ find: /^\.\/nativeRouter$/, replacement: resolve(root, 'src', 'webviewBridge.ts') }],
  },
  build: {
    outDir: join('vscode-extension', 'media'),
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(root, 'webview', 'main.tsx'),
      formats: ['iife'],
      name: 'CCRouterManage',
      fileName: () => 'manage.js',
    },
  },
  logLevel: 'info',
})

// Vite names the extracted stylesheet after the package; the panel expects
// manage.css next to manage.js.
try {
  await rename(
    resolve(extensionRoot, 'media', 'cc-router.css'),
    resolve(extensionRoot, 'media', 'manage.css'),
  )
} catch {
  // No stylesheet was emitted or it already has the final name.
}
