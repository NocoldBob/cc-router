import * as vscode from 'vscode'
import { listProviders, type ProbeResult, type ProviderSummary } from './helperClient'
import { text } from './localization'

type SectionId = 'workspace' | 'providers' | 'actions'

type RouterNode =
  | { type: 'section'; id: SectionId; label: string }
  | { type: 'info'; label: string; description?: string; icon: string; command?: vscode.Command }
  | { type: 'provider'; provider: ProviderSummary }
  | { type: 'action'; label: string; icon: string; command: string }

export class RouterTreeProvider implements vscode.TreeDataProvider<RouterNode> {
  private readonly changed = new vscode.EventEmitter<RouterNode | undefined | void>()
  readonly onDidChangeTreeData = this.changed.event

  private providers: ProviderSummary[] = []
  private workspace: string | undefined
  private ready = false
  private refreshGeneration = 0
  private readonly probeResults = new Map<string, { result: ProbeResult; at: Date }>()

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getWorkspace: () => string | undefined,
  ) {}

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration
    const workspace = this.getWorkspace()

    if (!workspace) {
      if (generation !== this.refreshGeneration) return
      this.workspace = undefined
      this.providers = []
      this.ready = false
      await this.updateContexts(false, true)
      if (generation !== this.refreshGeneration) return
      this.changed.fire()
      return
    }

    try {
      const providers = await listProviders(this.context, workspace)
      if (generation !== this.refreshGeneration) return
      this.workspace = workspace
      this.providers = providers
      this.ready = true
      await this.updateContexts(false, false)
    } catch {
      if (generation !== this.refreshGeneration) return
      this.workspace = workspace
      this.providers = []
      this.ready = false
      await this.updateContexts(true, false)
    }
    if (generation !== this.refreshGeneration) return
    this.changed.fire()
  }

  recordProbe(providerId: string, result: ProbeResult): void {
    this.probeResults.set(providerId, { result, at: new Date() })
    this.changed.fire()
  }

  getTreeItem(node: RouterNode): vscode.TreeItem {
    if (node.type === 'section') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded)
      item.id = `ccRouter.section.${node.id}`
      item.contextValue = `ccRouter.section.${node.id}`
      return item
    }

    if (node.type === 'provider') {
      const { provider } = node
      const probe = this.probeResults.get(provider.id)
      const item = new vscode.TreeItem(provider.displayName, vscode.TreeItemCollapsibleState.None)
      item.description = probe
        ? `${provider.mainModel} · ${probeLabel(probe.result)}`
        : provider.mainModel
      item.iconPath = new vscode.ThemeIcon(
        provider.selected ? 'check' : provider.credentialConfigured ? 'server-environment' : 'warning',
        provider.credentialConfigured ? undefined : new vscode.ThemeColor('list.warningForeground'),
      )
      item.tooltip = new vscode.MarkdownString(
        `**${provider.displayName}**\n\n${provider.mainModel}\n\n${provider.baseUrl}\n\n${
          provider.credentialConfigured
            ? text('凭据已配置', 'Credential configured')
            : text('需要在桌面端配置 API Key', 'API Key required in CC Router desktop')
        }${probe ? `\n\n${text('上次探测', 'Last probe')}: ${probeTooltip(probe.result, probe.at)}` : ''}`,
      )
      item.command = {
        command: 'ccRouter.selectSpecificProvider',
        title: text('选择 Provider', 'Select Provider'),
        arguments: [provider.id],
      }
      item.contextValue = provider.selected ? 'ccRouter.provider.selected' : 'ccRouter.provider'
      return item
    }

    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None)
    item.iconPath = new vscode.ThemeIcon(node.icon)
    if ('description' in node) item.description = node.description
    if (node.type === 'action') {
      item.command = { command: node.command, title: node.label }
    } else if (node.command) {
      item.command = node.command
    }
    return item
  }

  getChildren(node?: RouterNode): RouterNode[] {
    if (!this.workspace || !this.ready) return []
    if (!node) {
      return [
        { type: 'section', id: 'workspace', label: text('当前工作区', 'Current Workspace') },
        { type: 'section', id: 'providers', label: text('选择 Provider', 'Select Provider') },
        { type: 'section', id: 'actions', label: text('快捷操作', 'Quick Actions') },
      ]
    }
    if (node.type !== 'section') return []
    if (node.id === 'workspace') return this.workspaceItems()
    if (node.id === 'providers') {
      return this.providers
        .filter((provider) => provider.enabled)
        .map((provider) => ({ type: 'provider', provider }))
    }
    return this.actionItems()
  }

  private workspaceItems(): RouterNode[] {
    const selected = this.providers.find((provider) => provider.selected)
    if (!selected) {
      return [{
        type: 'info',
        label: text('尚未选择 Provider', 'No Provider selected'),
        icon: 'circle-slash',
        command: { command: 'ccRouter.selectProvider', title: text('选择 Provider', 'Select Provider') },
      }]
    }
    return [
      {
        type: 'info',
        label: selected.displayName,
        description: text('当前路由', 'Current route'),
        icon: 'check',
      },
      { type: 'info', label: selected.mainModel, description: text('模型', 'Model'), icon: 'symbol-method' },
      {
        type: 'info',
        label: endpointHost(selected.baseUrl),
        description: text('接口', 'Endpoint'),
        icon: 'globe',
      },
      {
        type: 'info',
        label: selected.credentialConfigured
          ? text('凭据已配置', 'Credential configured')
          : text('需要 API Key', 'API Key required'),
        icon: selected.credentialConfigured ? 'lock' : 'warning',
        command: selected.credentialConfigured
          ? undefined
          : { command: 'ccRouter.openDesktop', title: text('打开桌面端', 'Open Desktop') },
      },
    ]
  }

  private actionItems(): RouterNode[] {
    const selected = this.providers.some((provider) => provider.selected)
    const actions: RouterNode[] = [
      {
        type: 'action',
        label: text('启动 Claude Code 新会话', 'Start New Claude Code Session'),
        icon: 'play',
        command: 'ccRouter.newClaudeSession',
      },
      {
        type: 'action',
        label: text('打开 CC Router 桌面端', 'Open CC Router Desktop'),
        icon: 'settings-gear',
        command: 'ccRouter.openDesktop',
      },
    ]
    if (selected) {
      actions.splice(1, 0, {
        type: 'action',
        label: text('测试当前路由连接', 'Test Current Route'),
        icon: 'pulse',
        command: 'ccRouter.probeProvider',
      }, {
        type: 'action',
        label: text('清除当前工作区路由', 'Clear Workspace Route'),
        icon: 'clear-all',
        command: 'ccRouter.clearProvider',
      })
    }
    return actions
  }

  private async updateContexts(needsSetup: boolean, noWorkspace: boolean): Promise<void> {
    await Promise.all([
      vscode.commands.executeCommand('setContext', 'ccRouter.needsSetup', needsSetup),
      vscode.commands.executeCommand('setContext', 'ccRouter.noWorkspace', noWorkspace),
    ])
  }
}

function endpointHost(value: string): string {
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

export function probeLabel(result: ProbeResult): string {
  const latency = result.latencyMs !== undefined ? ` ${result.latencyMs}ms` : ''
  switch (result.kind) {
    case 'ok':
      return text(`正常${latency}`, `OK${latency}`)
    case 'overloaded':
      return text('服务饱和', 'Overloaded')
    case 'timeout':
      return text('响应超时', 'Timed out')
    case 'unreachable':
      return text('无法连接', 'Unreachable')
    case 'authFailed':
      return text('鉴权失败', 'Auth failed')
    case 'modelUnavailable':
      return text('模型不可用', 'Model unavailable')
    case 'serverError':
      return text('服务端错误', 'Server error')
    default:
      return text('响应异常', 'Unexpected response')
  }
}

function probeTooltip(result: ProbeResult, at: Date): string {
  const status = result.httpStatus !== undefined ? ` (HTTP ${result.httpStatus})` : ''
  return `${probeLabel(result)}${status} · ${at.toLocaleTimeString()}`
}
