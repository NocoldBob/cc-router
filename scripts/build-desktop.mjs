import { spawnSync } from 'node:child_process'

const bundles = process.platform === 'win32'
  ? 'nsis'
  : process.platform === 'linux'
    ? 'deb,appimage'
    : ''

if (!bundles) {
  throw new Error(`CC Router desktop builds do not support ${process.platform}.`)
}

const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('pnpm executable path is unavailable.')
const result = spawnSync(
  process.execPath,
  [pnpmCli, 'exec', 'tauri', 'build', '--bundles', bundles],
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
