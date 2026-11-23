import { chmod, copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The extension is self-contained: it ships only the platform helper.
// The desktop app is an optional standalone product distributed through
// GitHub Releases, never embedded in the VSIX.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const target = resolve(root, 'src-tauri', 'target', 'release')
const platform = process.platform === 'win32' ? 'win32-x64' : 'linux-x64'

const helperName = process.platform === 'win32' ? 'cc-router-helper.exe' : 'cc-router-helper'
const helperSource = resolve(target, helperName)
const helperDestination = resolve(root, 'vscode-extension', 'bin', platform, helperName)

await mkdir(dirname(helperDestination), { recursive: true })
await copyFile(helperSource, helperDestination)
if (process.platform !== 'win32') {
  await chmod(helperDestination, 0o755)
}
