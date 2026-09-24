import { chmod, copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const target = resolve(root, 'src-tauri', 'target', 'release')
const platform = process.platform === 'win32' ? 'win32-x64' : 'linux-x64'

const helperName = process.platform === 'win32' ? 'cc-router-helper.exe' : 'cc-router-helper'
const helperSource = resolve(target, helperName)
const helperDestination = resolve(root, 'vscode-extension', 'bin', platform, helperName)

const installerDirectory = process.platform === 'win32'
  ? resolve(target, 'bundle', 'nsis')
  : resolve(target, 'bundle', 'appimage')
const installerSuffix = process.platform === 'win32' ? '-setup.exe' : '.AppImage'
const installerName = (await readdir(installerDirectory)).find((name) => name.endsWith(installerSuffix))
if (!installerName) throw new Error(`No ${installerSuffix} desktop bundle was found.`)

const installerSource = resolve(installerDirectory, installerName)
const installerDestination = process.platform === 'win32'
  ? resolve(root, 'vscode-extension', 'desktop', platform, 'cc-router-desktop-setup.exe')
  : resolve(root, 'vscode-extension', 'desktop', platform, 'cc-router-desktop.AppImage')

await mkdir(dirname(helperDestination), { recursive: true })
await mkdir(dirname(installerDestination), { recursive: true })
await copyFile(helperSource, helperDestination)
await copyFile(installerSource, installerDestination)
if (process.platform !== 'win32') {
  await chmod(helperDestination, 0o755)
  await chmod(installerDestination, 0o755)
}
