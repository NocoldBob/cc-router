import type {
  DiagnosticsReport,
  LaunchReadiness,
  NativeActionResult,
  RuntimeInfo,
  SessionInfo,
  UserRouteStatus,
} from './nativeRouter'
import type { Provider } from '../shared/types'

export type {
  LaunchReadiness,
  RuntimeInfo,
  SessionInfo,
  SessionTarget,
  UserRouteStatus,
} from './nativeRouter'

/**
 * VS Code webview backend for the management UI. It mirrors the
 * `nativeRouter` API surface, but every call is forwarded to the extension
 * host over postMessage. Only the webview bundle aliases `./nativeRouter`
 * to this module; the Tauri desktop build is untouched.
 *
 * Security notes:
 * - There is no "read credential" method by design; the webview can only
 *   learn whether a key exists.
 * - API keys typed by the user travel webview -> extension host -> helper
 *   stdin, never into files, settings, or localStorage.
 */

interface VsCodeApi {
  postMessage(message: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
let nextId = 1
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()

window.addEventListener('message', (event) => {
  const message = event.data as {
    kind?: string
    id?: number
    result?: unknown
    error?: string
  }
  if (!message || typeof message.id !== 'number') return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.kind === 'result') entry.resolve(message.result)
  else entry.reject(new Error(message.error || 'The extension host rejected the request.'))
})

function call<T>(method: string, params?: unknown): Promise<T> {
  const id = nextId
  nextId += 1
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
    vscode.postMessage({ kind: 'request', id, method, params })
  })
}

// Seed the management UI's expected localStorage keys from the extension
// host before App.tsx reads them at mount. The store is the source of
// truth, so the Providers key is always overwritten on panel creation.
declare global {
  interface Window {
    __CC_ROUTER_SEED__?: { providers?: string }
  }
}
const seed = window.__CC_ROUTER_SEED__
if (seed?.providers) {
  window.localStorage.setItem('cc-router.providers.v1', seed.providers)
}

export const nativeRuntimeAvailable = true

export function getRuntimeInfo() {
  return call<RuntimeInfo>('getRuntimeInfo')
}

export function getCredentialStatus(providerId: string) {
  return call<{ providerId: string; configured: boolean }>('getCredentialStatus', { providerId })
}

export function saveCredential(providerId: string, token: string) {
  return call<{ providerId: string; configured: boolean }>('saveCredential', { providerId, token })
}

export function deleteCredential(providerId: string) {
  return call<{ providerId: string; configured: boolean }>('deleteCredential', { providerId })
}

export function syncProviderCatalog(providers: Provider[]) {
  return call<void>('syncProviderCatalog', { providers })
}

export function getUserRouteStatus(provider: Provider) {
  return call<UserRouteStatus>('getUserRouteStatus', { provider })
}

export function getLaunchReadiness(
  provider: Provider,
  cliPath?: string,
  workingDirectory?: string,
) {
  return call<LaunchReadiness>('getLaunchReadiness', {
    provider,
    cliPath: cliPath || '',
    workingDirectory: workingDirectory || '',
  })
}

export function launchClaude(provider: Provider, _cliPath?: string, workingDirectory?: string) {
  return call<NativeActionResult>('launchClaude', {
    provider,
    workingDirectory: workingDirectory || '',
  })
}

export function launchTerminal(provider: Provider, workingDirectory?: string) {
  return call<NativeActionResult>('launchTerminal', {
    provider,
    workingDirectory: workingDirectory || '',
  })
}

export function launchVsCode(provider: Provider, workingDirectory: string) {
  return call<NativeActionResult>('launchVsCode', { provider, workingDirectory })
}

export function listSessions() {
  return call<SessionInfo[]>('listSessions')
}

export function killSession(sessionId: number) {
  return call<SessionInfo>('killSession', { sessionId })
}

export function getDiagnostics(cliPath?: string) {
  return call<DiagnosticsReport>('getDiagnostics', { cliPath: cliPath || '' })
}

export function applyUserRoute(provider: Provider) {
  return call<NativeActionResult>('applyUserRoute', { provider })
}

export function clearUserRoute() {
  return call<NativeActionResult>('clearUserRoute')
}

export function rollbackUserRoute() {
  return call<NativeActionResult>('rollbackUserRoute')
}

export function saveDiagnosticsReport(report: DiagnosticsReport) {
  return call<void>('saveDiagnosticsReport', { report })
}
