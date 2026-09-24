import { spawnSync } from 'node:child_process'

const target = process.platform === 'win32' ? 'win32-x64' : 'linux-x64'
const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('pnpm executable path is unavailable.')
const result = spawnSync(
  process.execPath,
  [pnpmCli, 'exec', 'vsce', 'package', '--no-dependencies', '--target', target],
  { stdio: 'inherit' },
)

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
