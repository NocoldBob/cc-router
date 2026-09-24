import { invoke, isTauri } from '@tauri-apps/api/core'
import type { Provider } from './types'

export interface NativeProviderRoute {
  id: string
  displayName: string
  baseUrl: string
  authEnvName: string
  mainModel: string
  fastModel: string
  opusModel: string
  sonnetModel: string
  haikuModel: string
  fableModel: string
  subagentModel: string
  effortLevel: string
  autoCompactWindow: string
  maxContextTokens: string
}

export interface RuntimeInfo {
  native: boolean
  platform: string
  cliAvailable: boolean
  cliPath?: string
  credentialStore: string
  persistentRouteSupported: boolean
}

export interface CredentialStatus {
  providerId: string
  configured: boolean
}

export interface LaunchReadiness {
  routeValid: boolean
  cliAvailable: boolean
  cliPath?: string
  credentialConfigured: boolean
  workingDirectoryValid: boolean
  conflictingVariables: string[]
  ready: boolean
}

export interface UserRouteStatus {
  baseUrl?: string
  model?: string
  opusModel?: string
  sonnetModel?: string
  haikuModel?: string
  fableModel?: string
  subagentModel?: string
  effortLevel?: string
  autoCompactWindow?: string
  maxContextTokens?: string
  authTokenSet: boolean
  matchesSelected: boolean
  backupAvailable: boolean
}

export interface NativeActionResult {
  message: string
  changedVariables: string[]
  processId?: number
}

export const nativeRuntimeAvailable = isTauri()

export function toNativeRoute(provider: Provider): NativeProviderRoute {
  return {
    id: provider.id,
    displayName: provider.displayName,
    baseUrl: provider.baseUrl,
    authEnvName: provider.authEnvName,
    mainModel: provider.mainModel,
    fastModel: provider.fastModel,
    opusModel: provider.opusModel,
    sonnetModel: provider.sonnetModel,
    haikuModel: provider.haikuModel,
    fableModel: provider.fableModel,
    subagentModel: provider.subagentModel,
    effortLevel: provider.effortLevel,
    autoCompactWindow: provider.autoCompactWindow,
    maxContextTokens: provider.maxContextTokens,
  }
}

export async function getRuntimeInfo(cliPath?: string) {
  return invoke<RuntimeInfo>('runtime_info', { cliPath: cliPath || null })
}

export async function getCredentialStatus(providerId: string) {
  return invoke<CredentialStatus>('get_credential_status', { providerId })
}

export async function getLaunchReadiness(
  provider: Provider,
  cliPath?: string,
  workingDirectory?: string,
) {
  return invoke<LaunchReadiness>('get_launch_readiness', {
    route: toNativeRoute(provider),
    cliPath: cliPath || null,
    workingDirectory: workingDirectory || null,
  })
}

export async function saveCredential(providerId: string, token: string) {
  return invoke<CredentialStatus>('save_credential', { providerId, token })
}

export async function deleteCredential(providerId: string) {
  return invoke<CredentialStatus>('delete_credential', { providerId })
}

export async function syncProviderCatalog(providers: Provider[]) {
  return invoke<void>('sync_provider_catalog', { providers })
}

export async function getUserRouteStatus(provider: Provider) {
  return invoke<UserRouteStatus>('get_user_route_status', {
    route: toNativeRoute(provider),
  })
}

export async function launchClaude(
  provider: Provider,
  cliPath?: string,
  workingDirectory?: string,
) {
  return invoke<NativeActionResult>('launch_claude', {
    route: toNativeRoute(provider),
    cliPath: cliPath || null,
    workingDirectory: workingDirectory || null,
  })
}

export async function applyUserRoute(provider: Provider) {
  return invoke<NativeActionResult>('apply_user_route', {
    route: toNativeRoute(provider),
  })
}

export async function clearUserRoute() {
  return invoke<NativeActionResult>('clear_user_route')
}

export async function rollbackUserRoute() {
  return invoke<NativeActionResult>('rollback_user_route')
}
