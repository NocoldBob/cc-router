import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

const execFileAsync = promisify(execFile)

/** Result of a helper route action; mirrors the desktop ActionResult shape. */
export interface HelperActionResult {
  message: string
  changedVariables: string[]
}

export interface ProviderSummary {
  id: string
  displayName: string
  baseUrl: string
  mainModel: string
  enabled: boolean
  credentialConfigured: boolean
  selected: boolean
}

export type ProbeKind =
  | 'ok'
  | 'unreachable'
  | 'timeout'
  | 'authFailed'
  | 'modelUnavailable'
  | 'overloaded'
  | 'serverError'
  | 'unexpected'

/** Sanitized probe outcome from the helper; never contains the API key or response bodies. */
export interface ProbeResult {
  kind: ProbeKind
  latencyMs?: number
  httpStatus?: number
  testedModel: string
}

export function resolveHelperPath(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace
    .getConfiguration('ccRouter')
    .get<string>('helperPath', '')
    .trim()
  if (configured) return configured
  const platform = process.platform === 'win32' ? 'win32-x64' : 'linux-x64'
  const executable = process.platform === 'win32' ? 'cc-router-helper.exe' : 'cc-router-helper'
  return context.asAbsolutePath(`bin/${platform}/${executable}`)
}

export function helperExists(context: vscode.ExtensionContext): boolean {
  return existsSync(resolveHelperPath(context))
}

export async function listProviders(
  context: vscode.ExtensionContext,
  workspace: string,
): Promise<ProviderSummary[]> {
  const output = await runHelper(context, ['list', workspace])
  return JSON.parse(output) as ProviderSummary[]
}

export async function selectProvider(
  context: vscode.ExtensionContext,
  workspace: string,
  providerId: string,
): Promise<void> {
  await runHelper(context, ['select', workspace, providerId])
}

export async function clearProvider(
  context: vscode.ExtensionContext,
  workspace: string,
): Promise<void> {
  await runHelper(context, ['clear', workspace])
}

export async function probeProvider(
  context: vscode.ExtensionContext,
  providerId: string,
): Promise<ProbeResult> {
  const output = await runHelper(context, ['probe', providerId], 25_000)
  return JSON.parse(output) as ProbeResult
}

export async function helperVersion(context: vscode.ExtensionContext): Promise<string> {
  return runHelper(context, ['version'])
}

/**
 * Replaces the helper-side Provider catalog mirror. The catalog JSON travels
 * over stdin and contains no credentials by construction.
 */
export async function syncCatalog(
  context: vscode.ExtensionContext,
  catalogJson: string,
): Promise<void> {
  await runHelper(context, ['sync-catalog'], 10_000, catalogJson)
}

/** Reads the secret-free catalog the desktop app may have created. */
export async function exportCatalog(context: vscode.ExtensionContext): Promise<string> {
  return runHelper(context, ['export-catalog'])
}

/**
 * Stores an API key in the OS credential store. The key is piped to the
 * helper over stdin and never appears in process arguments or logs.
 */
export async function storeCredential(
  context: vscode.ExtensionContext,
  providerId: string,
  token: string,
): Promise<void> {
  await runHelper(context, ['store-credential', providerId], 10_000, `${token}\n`)
}

export async function deleteCredential(
  context: vscode.ExtensionContext,
  providerId: string,
): Promise<void> {
  await runHelper(context, ['delete-credential', providerId])
}

export async function launchTerminal(
  context: vscode.ExtensionContext,
  providerId: string,
  workingDirectory?: string,
): Promise<HelperActionResult> {
  const args = ['launch-terminal', providerId]
  if (workingDirectory) args.push(workingDirectory)
  const output = await runHelper(context, args)
  return JSON.parse(output) as HelperActionResult
}

export async function applyRoute(
  context: vscode.ExtensionContext,
  providerId: string,
): Promise<HelperActionResult> {
  const output = await runHelper(context, ['apply-route', providerId])
  return JSON.parse(output) as HelperActionResult
}

export async function clearRoute(context: vscode.ExtensionContext): Promise<HelperActionResult> {
  const output = await runHelper(context, ['clear-route'])
  return JSON.parse(output) as HelperActionResult
}

export async function rollbackRoute(context: vscode.ExtensionContext): Promise<HelperActionResult> {
  const output = await runHelper(context, ['rollback-route'])
  return JSON.parse(output) as HelperActionResult
}

/** Redacted diagnostics report; contains variable names and booleans only. */
export async function getDiagnostics(context: vscode.ExtensionContext): Promise<string> {
  return runHelper(context, ['diagnostics'], 15_000)
}

async function runHelper(
  context: vscode.ExtensionContext,
  args: string[],
  timeout = 10_000,
  stdin?: string,
): Promise<string> {
  const helper = resolveHelperPath(context)
  if (!existsSync(helper)) {
    throw new Error(`CC Router helper was not found: ${helper}`)
  }
  try {
    const child = execFileAsync(helper, args, {
      windowsHide: true,
      encoding: 'utf8',
      timeout,
    })
    if (stdin !== undefined) {
      if (!child.child.stdin) throw new Error('CC Router helper stdin is unavailable.')
      child.child.stdin.write(stdin)
      child.child.stdin.end()
    }
    const { stdout } = await child
    return stdout.trim()
  } catch (error) {
    const detail = error as Error & { stderr?: string }
    throw new Error(detail.stderr?.trim() || detail.message)
  }
}
