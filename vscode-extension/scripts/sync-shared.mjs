import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The canonical Provider templates, validation, and command generators live in
// the repository-level shared/ directory so the desktop UI and this extension
// cannot drift apart. They are copied into src/shared/ (git-ignored) before
// every TypeScript build because the extension compiles with rootDir: src.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const files = ['types.ts', 'defaultProviders.ts', 'providerValidation.ts', 'routerCommands.ts']

const destination = resolve(root, 'vscode-extension', 'src', 'shared')
await mkdir(destination, { recursive: true })
for (const file of files) {
  await copyFile(resolve(root, 'shared', file), resolve(destination, file))
}
console.log(`Synced ${files.length} shared modules into src/shared/`)
