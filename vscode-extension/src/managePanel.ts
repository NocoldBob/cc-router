import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as vscode from 'vscode'
import { credentialStoreLabel } from './desktopApp'
import * as helper from './helperClient'
import { text } from './localization'
import type { ProviderStore } from './providerStore'
import { providerIsValid } from './shared/providerValidation'
import type { Provider } from './shared/types'

const CLAUDE_EXTENSION_ID = 'anthropic.claude-code'

interface BridgeRequest {
  kind?: string
  id?: number
  method?: string
  params?: Record<string, unknown>
}

/**
 * Hosts the shared management UI (the same React app the desktop uses) in a
 * webview panel and dispatches its bridge calls to the extension-side
 * ProviderStore and the helper. There is intentionally no bridge method that
 * returns a stored API key.
 */
export class ManagePanel {
  private static current: ManagePanel | undefined

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly store: Promise<ProviderStore>,
    private readonly refresh: () => Promise<void>,
  ) {
    this.panel.webview.onDidReceiveMessage((message: BridgeRequest) => {
      void this.handle(message)
    })
    this.panel.onDidDispose(() => {
      if (ManagePanel.current === this) ManagePanel.current = undefined
    })
  }

  static async show(
    context: vscode.ExtensionContext,
    store: Promise<ProviderStore>,
    refresh: () => Promise<void>,
  ): Promise<void> {
    if (ManagePanel.current) {
      ManagePanel.current.panel.reveal()
      return
    }
    const panel = vscode.window.createWebviewPanel(
      'ccRouter.manage',
      text('CC Router Provider 管理', 'CC Router Provider Manager'),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(join(context.extensionPath, 'media'))],
      },
    )
    const instance = new ManagePanel(panel, context, store, refresh)
    ManagePanel.current = instance
    panel.webview.html = await instance.renderHtml()
  }

  private async renderHtml(): Promise<string> {
    const nonce = String(Date.now()) + String(Math.random()).slice(2)
    const webview = this.panel.webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(join(this.context.extensionPath, 'media', 'manage.js')),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.file(join(this.context.extensionPath, 'media', 'manage.css')),
    )
    let providersJson = '[]'
    try {
      providersJson = JSON.stringify((await this.store).list())
    } catch {
      // The webview falls back to its built-in templates.
    }
    const seed = JSON.stringify({ providers: providersJson }).replace(/</g, '\\u003c')
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ')
    return `<!DOCTYPE html>
<html lang="zh-cn">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${styleUri}" rel="stylesheet">
<script nonce="${nonce}">window.__CC_ROUTER_SEED__=${seed};</script>
<title>CC Router</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  private async handle(message: BridgeRequest): Promise<void> {
    if (message?.kind !== 'request' || typeof message.id !== 'number' || !message.method) return
    try {
      const result = await this.dispatch(message.method, message.params ?? {})
      await this.panel.webview.postMessage({ kind: 'result', id: message.id, result })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await this.panel.webview.postMessage({ kind: 'error', id: message.id, error: detail })
    }
  }

  private async dispatch(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const context = this.context
    switch (method) {
      case 'getRuntimeInfo':
        return {
          native: true,
          platform: process.platform === 'win32' ? 'windows' : 'linux',
          cliAvailable: Boolean(vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)),
          credentialStore: credentialStoreLabel(),
          persistentRouteSupported: process.platform === 'win32',
          host: 'vscode',
        }
      case 'getCredentialStatus':
        return helper.credentialStatus(context, String(params.providerId))
      case 'saveCredential':
        await helper.storeCredential(context, String(params.providerId), String(params.token))
        await this.refresh()
        return { providerId: params.providerId, configured: true }
      case 'deleteCredential':
        await helper.deleteCredential(context, String(params.providerId))
        await this.refresh()
        return { providerId: params.providerId, configured: false }
      case 'syncProviderCatalog':
        await (await this.store).updateAll(params.providers as Provider[])
        await this.refresh()
        return null
      case 'getUserRouteStatus':
        return this.userRouteStatus(params.provider as Provider)
      case 'getLaunchReadiness':
        return this.launchReadiness(params)
      case 'launchClaude':
        return this.startSession(params.provider as Provider, String(params.workingDirectory || ''))
      case 'launchTerminal':
        return helper.launchTerminal(
          context,
          String((params.provider as Provider).id),
          String(params.workingDirectory || '') || undefined,
        )
      case 'launchVsCode':
        return this.bindWorkspace(
          params.provider as Provider,
          String(params.workingDirectory || ''),
        )
      case 'listSessions':
        return []
      case 'killSession':
        throw new Error(
          text('会话面板仅桌面端提供。', 'The session panel is only available in the desktop app.'),
        )
      case 'getDiagnostics':
        return JSON.parse(await helper.getDiagnostics(context)) as unknown
      case 'applyUserRoute':
        return helper.applyRoute(context, String((params.provider as Provider).id))
      case 'clearUserRoute':
        return helper.clearRoute(context)
      case 'rollbackUserRoute':
        return helper.rollbackRoute(context)
      case 'saveDiagnosticsReport':
        return this.saveDiagnostics(params.report)
      default:
        throw new Error(`Unknown CC Router bridge method: ${method}`)
    }
  }

  private async userRouteStatus(provider: Provider): Promise<unknown> {
    if (process.platform !== 'win32') {
      return { matchesSelected: false, backupAvailable: false, authTokenSet: false }
    }
    return helper.routeStatus(this.context, provider.id)
  }

  private async launchReadiness(params: Record<string, unknown>): Promise<unknown> {
    const provider = params.provider as Provider
    const store = await this.store
    const routeValid = providerIsValid(provider, store.list())
    const cliAvailable = Boolean(vscode.extensions.getExtension(CLAUDE_EXTENSION_ID))
    const workingDirectory = String(params.workingDirectory || '').trim()
    const workingDirectoryValid = !workingDirectory || existsSync(workingDirectory)
    let credentialConfigured = false
    try {
      credentialConfigured = (await helper.credentialStatus(this.context, provider.id)).configured
    } catch {
      credentialConfigured = false
    }
    return {
      routeValid,
      cliAvailable,
      credentialConfigured,
      workingDirectoryValid,
      conflictingVariables: [],
      ready: routeValid && cliAvailable && credentialConfigured && workingDirectoryValid,
    }
  }

  private async startSession(
    provider: Provider,
    workingDirectory: string,
  ): Promise<unknown> {
    const workspace = workingDirectory.trim() || this.currentWorkspace()
    if (!workspace) {
      throw new Error(
        text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
      )
    }
    await helper.selectProvider(this.context, workspace, provider.id)
    await vscode.commands.executeCommand('ccRouter.configureIntegration')
    const extension = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)
    if (!extension) {
      throw new Error(
        text(
          '尚未安装 Anthropic 官方 Claude Code 扩展。',
          'The official Anthropic Claude Code extension is not installed.',
        ),
      )
    }
    await extension.activate()
    await vscode.commands.executeCommand('claude-vscode.newConversation')
    await this.refresh()
    return {
      message: text(
        `已为当前工作区选择 ${provider.displayName} 并打开新会话。`,
        `${provider.displayName} selected and a new session was opened.`,
      ),
      changedVariables: [],
    }
  }

  private async bindWorkspace(provider: Provider, workingDirectory: string): Promise<unknown> {
    const workspace = workingDirectory.trim() || this.currentWorkspace()
    if (!workspace) {
      throw new Error(
        text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
      )
    }
    await helper.selectProvider(this.context, workspace, provider.id)
    await this.refresh()
    return {
      message: text(
        `当前工作区已绑定 ${provider.displayName}，新的 Claude Code 会话将使用此路由。`,
        `This workspace is bound to ${provider.displayName}; new sessions will use this route.`,
      ),
      changedVariables: [],
    }
  }

  private async saveDiagnostics(report: unknown): Promise<unknown> {
    const target = await vscode.window.showSaveDialog({
      title: text('导出脱敏诊断报告', 'Export redacted diagnostics report'),
      defaultUri: vscode.Uri.file('cc-router-diagnostics.json'),
      filters: { JSON: ['json'] },
    })
    if (!target) return null
    await writeFile(target.fsPath, JSON.stringify(report, null, 2), 'utf8')
    return null
  }

  private currentWorkspace(): string | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri
    const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined
    return activeFolder?.uri.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  }
}
