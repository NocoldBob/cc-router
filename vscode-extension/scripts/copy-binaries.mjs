import { chmod, copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const target = resolve(root, 'src-tauri', 'target', 'release')
const platform = process.platform === 'win32' ? 'win32-x64' : 'linux-x64'

const helperName = process.platform === 'win32' ? 'cc-router-helper.exe' : 'cc-router-helper'
const helperSource = resolve(target, helperName)
const helperDestination = resolve(root, 'vscode-extension', 'bin', platform, helperName)

// Always bundle the installer matching the current desktop version; older
// bundles stay in the output directory and must never be picked up.
const tauriConfig = JSON.parse(
  await readFile(resolve(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
)
const desktopVersion = tauriConfig.version
if (!desktopVersion) throw new Error('The desktop version is missing from tauri.conf.json.')

const installerDirectory = process.platform === 'win32'
  ? resolve(target, 'bundle', 'nsis')
  : resolve(target, 'bundle', 'appimage')
const installerSuffix = process.platform === 'win32' ? '-setup.exe' : '.AppImage'
const installerCandidates = (await readdir(installerDirectory)).filter(
  (name) => name.includes(`_${desktopVersion}_`) && name.endsWith(installerSuffix),
)
if (installerCandidates.length !== 1) {
  throw new Error(
    `Expected exactly one desktop ${desktopVersion} bundle in ${installerDirectory}, found: ${installerCandidates.join(', ') || 'none'}.`,
  )
}

const installerSource = resolve(installerDirectory, installerCandidates[0])
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
