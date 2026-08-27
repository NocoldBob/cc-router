import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import * as vscode from 'vscode'

const execFileAsync = promisify(execFile)

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
  return configured || context.asAbsolutePath('bin/cc-router-helper.exe')
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

async function runHelper(
  context: vscode.ExtensionContext,
  args: string[],
  timeout = 10_000,
): Promise<string> {
  const helper = resolveHelperPath(context)
  if (!existsSync(helper)) {
    throw new Error(`CC Router helper was not found: ${helper}`)
  }
  try {
    const { stdout } = await execFileAsync(helper, args, {
      windowsHide: true,
      encoding: 'utf8',
      timeout,
    })
    return stdout.trim()
  } catch (error) {
    const detail = error as Error & { stderr?: string }
    throw new Error(detail.stderr?.trim() || detail.message)
  }
}
