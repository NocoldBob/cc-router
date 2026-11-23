import { spawn } from 'node:child_process'
import * as vscode from 'vscode'
import {
  credentialStoreLabel,
  findDesktopExecutable,
  focusRunningDesktop,
} from './desktopApp'
import {
  clearProvider,
  helperExists,
  listProviders,
  probeProvider,
  resolveHelperPath,
  selectProvider,
  storeCredential,
  type ProviderSummary,
} from './helperClient'
import { text } from './localization'
import { ManagePanel } from './managePanel'
import { ProviderStore } from './providerStore'
import { probeLabel, RouterTreeProvider } from './routerTree'

const PREVIOUS_WRAPPER_KEY = 'ccRouter.previousClaudeProcessWrapper'
const ONBOARDING_VERSION_KEY = 'ccRouter.onboardingVersion'
const CLAUDE_EXTENSION_ID = 'anthropic.claude-code'
const CLAUDE_WRAPPER_SETTING = 'claudeProcessWrapper'

let providerStorePromise: Promise<ProviderStore> | undefined

function providerStore(context: vscode.ExtensionContext): Promise<ProviderStore> {
  if (!providerStorePromise) {
    providerStorePromise = ProviderStore.load(context)
    providerStorePromise.catch(() => {
      providerStorePromise = undefined
    })
  }
  return providerStorePromise
}

export function activate(context: vscode.ExtensionContext): void {
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 35)
  status.name = 'CC Router'
  status.command = 'ccRouter.selectProvider'
  status.text = '$(server-environment) CC Router'
  status.tooltip = text(
    '为当前工作区选择 Claude Code Provider',
    'Select a Claude Code Provider for this workspace',
  )
  status.show()

  const treeProvider = new RouterTreeProvider(context, currentWorkspace)
  const tree = vscode.window.createTreeView('ccRouter.overview', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  })
  const refresh = async () => {
    await Promise.all([refreshStatus(context, status), treeProvider.refresh()])
  }

  context.subscriptions.push(
    status,
    tree,
    vscode.commands.registerCommand('ccRouter.selectProvider', () => chooseProvider(context, refresh)),
    vscode.commands.registerCommand('ccRouter.selectSpecificProvider', (providerId: string) =>
      chooseSpecificProvider(context, providerId, refresh)),
    vscode.commands.registerCommand('ccRouter.newClaudeSession', () =>
      startClaudeSession(context, refresh)),
    vscode.commands.registerCommand('ccRouter.clearProvider', () =>
      clearWorkspaceProvider(context, refresh)),
    vscode.commands.registerCommand('ccRouter.probeProvider', (node?: unknown) =>
      probeConnection(context, treeProvider, node)),
    vscode.commands.registerCommand('ccRouter.configureIntegration', () =>
      configureIntegration(context)),
    vscode.commands.registerCommand('ccRouter.restorePreviousWrapper', () =>
      restorePreviousWrapper(context)),
    vscode.commands.registerCommand('ccRouter.refresh', () =>
      refreshWithFeedback(context, refresh)),
    vscode.commands.registerCommand('ccRouter.storeCredential', () =>
      saveApiKey(context, refresh)),
    vscode.commands.registerCommand('ccRouter.manageProviders', () =>
      ManagePanel.show(context, providerStore(context), refresh)),
    vscode.commands.registerCommand('ccRouter.openDesktop', () => openDesktop()),
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('ccRouter') ||
        event.affectsConfiguration('claudeCode.claudeProcessWrapper')
      ) {
        void refresh()
      }
    }),
  )

  void providerStore(context).catch(() => undefined)
  void refresh()
  void showOnboarding(context)
}

async function saveApiKey(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<void> {
  if (!environmentSupported() || !helperReady(context)) return
  let store: ProviderStore
  try {
    store = await providerStore(context)
  } catch (error) {
    await showHelperError(context, error)
    return
  }
  const providers = store.list().filter((provider) => provider.enabled)
  if (!providers.length) {
    void vscode.window.showWarningMessage(
      text('没有可用的 Provider。', 'No Provider is available.'),
    )
    return
  }
  const picked = await vscode.window.showQuickPick(
    providers.map((provider) => ({
      label: provider.displayName,
      description: provider.baseUrl,
      provider,
    })),
    {
      title: text('CC Router：保存 API Key', 'CC Router: Save API Key'),
      placeHolder: text('选择这个 Key 属于哪个 Provider', 'Select the Provider this key belongs to'),
    },
  )
  if (!picked) return
  const token = await vscode.window.showInputBox({
    title: text(
      `${picked.provider.displayName} 的 API Key`,
      `${picked.provider.displayName} API Key`,
    ),
    prompt: text(
      'Key 只会写入系统凭据库，不会保存在设置或配置文件中。',
      'The key is written to the OS credential store only, never to settings or config files.',
    ),
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) =>
      value.trim() ? undefined : text('API Key 不能为空。', 'The API key cannot be empty.'),
  })
  if (!token?.trim()) return
  try {
    await storeCredential(context, picked.provider.id, token.trim())
    await refresh()
    void vscode.window.showInformationMessage(
      text(
        `${picked.provider.displayName} 的 API Key 已保存到 ${credentialStoreLabel()}。`,
        `${picked.provider.displayName} API Key saved to ${credentialStoreLabel()}.`,
      ),
    )
  } catch (error) {
    await showHelperError(context, error)
  }
}

export function deactivate(): void {}

async function showOnboarding(context: vscode.ExtensionContext): Promise<void> {
  const version = String(context.extension.packageJSON.version)
  if (context.globalState.get<string>(ONBOARDING_VERSION_KEY) !== version) {
    await context.globalState.update(ONBOARDING_VERSION_KEY, version)
    await vscode.commands.executeCommand('workbench.view.extension.ccRouter')
  }
}

async function chooseProvider(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<ProviderSummary | undefined> {
  if (!environmentSupported() || !helperReady(context)) return undefined
  const workspace = currentWorkspace()
  if (!workspace) {
    void vscode.window.showWarningMessage(
      text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
    )
    return undefined
  }

  try {
    const providers = await listProviders(context, workspace)
    const items = providers
      .filter((provider) => provider.enabled)
      .map((provider) => ({
        label: `${provider.selected ? '$(check) ' : ''}${provider.displayName}`,
        description: provider.mainModel,
        detail: `${provider.baseUrl}  |  ${provider.credentialConfigured
          ? text('凭据已配置', 'Credential configured')
          : text('需要 API Key', 'API Key required')}`,
        provider,
      }))
    const picked = await vscode.window.showQuickPick(items, {
      title: text('CC Router：为当前工作区选择 Provider', 'CC Router: Provider for this workspace'),
      placeHolder: text('选择一个 Provider', 'Select a Provider'),
      matchOnDescription: true,
      matchOnDetail: true,
    })
    if (!picked) return undefined
    return applyProvider(context, workspace, picked.provider, refresh)
  } catch (error) {
    await showHelperError(context, error)
    return undefined
  }
}

async function chooseSpecificProvider(
  context: vscode.ExtensionContext,
  providerId: string,
  refresh: () => Promise<void>,
): Promise<void> {
  if (!environmentSupported() || !helperReady(context)) return
  const workspace = currentWorkspace()
  if (!workspace) return
  try {
    const provider = (await listProviders(context, workspace)).find(
      (candidate) => candidate.id === providerId && candidate.enabled,
    )
    if (!provider) {
      void vscode.window.showErrorMessage(
        text('所选 Provider 已不存在或已停用。', 'The selected Provider no longer exists or is disabled.'),
      )
      await refresh()
      return
    }
    await applyProvider(context, workspace, provider, refresh)
  } catch (error) {
    await showHelperError(context, error)
  }
}

async function applyProvider(
  context: vscode.ExtensionContext,
  workspace: string,
  provider: ProviderSummary,
  refresh: () => Promise<void>,
): Promise<ProviderSummary | undefined> {
  if (!provider.credentialConfigured) {
    const action = await vscode.window.showWarningMessage(
      text(
        `${provider.displayName} 尚未在 ${credentialStoreLabel()} 中配置 API Key。`,
        `${provider.displayName} has no API Key in ${credentialStoreLabel()}.`,
      ),
      text('打开 Provider 管理', 'Open Provider Manager'),
    )
    if (action) await vscode.commands.executeCommand('ccRouter.manageProviders')
    return undefined
  }

  await selectProvider(context, workspace, provider.id)
  await configureIntegration(context, false)
  await refresh()
  void vscode.window.showInformationMessage(
    text(
      `已为当前工作区选择 ${provider.displayName}，新的 Claude Code 会话将使用此路由。`,
      `${provider.displayName} selected. New Claude Code sessions will use this route.`,
    ),
  )
  return provider
}

async function startClaudeSession(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<void> {
  if (!environmentSupported() || !helperReady(context)) return
  const workspace = currentWorkspace()
  if (!workspace) {
    void vscode.window.showWarningMessage(
      text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
    )
    return
  }
  let selected: ProviderSummary | undefined
  try {
    selected = (await listProviders(context, workspace)).find((provider) => provider.selected)
  } catch (error) {
    await showHelperError(context, error)
    return
  }
  if (!selected?.enabled || !selected.credentialConfigured) {
    selected = await chooseProvider(context, refresh)
  }
  if (!selected || !(await configureIntegration(context, false))) return

  const extension = vscode.extensions.getExtension(CLAUDE_EXTENSION_ID)
  if (!extension) {
    void vscode.window.showErrorMessage(
      text(
        '尚未安装 Anthropic 官方 Claude Code 扩展。',
        'The official Anthropic Claude Code extension is not installed.',
      ),
    )
    return
  }
  await extension.activate()
  await vscode.commands.executeCommand('claude-vscode.newConversation')
}

async function configureIntegration(
  context: vscode.ExtensionContext,
  alwaysConfirm = true,
): Promise<boolean> {
  if (!helperReady(context)) return false
  const helper = resolveHelperPath(context)
  const configuration = vscode.workspace.getConfiguration('claudeCode')
  const current = configuration.get<string>(CLAUDE_WRAPPER_SETTING, '')
  if (pathsEqual(current, helper)) {
    await vscode.commands.executeCommand('setContext', 'ccRouter.integrationConfigured', true)
    return true
  }

  const message = current
    ? text(
        'Claude Code 已配置其他进程 wrapper。CC Router 可以替换它，并记住原来的设置。',
        'Claude Code already uses another process wrapper. CC Router can replace it and remember the previous value.',
      )
    : text(
        '是否让新的 Claude Code 会话通过 CC Router 安全 wrapper 启动？',
        'Configure Claude Code to launch new sessions through the CC Router security wrapper?',
      )
  if (alwaysConfirm || current) {
    const configureLabel = text('配置', 'Configure')
    const choice = await vscode.window.showWarningMessage(
      message,
      { modal: Boolean(current) },
      configureLabel,
    )
    if (choice !== configureLabel) return false
  }

  if (context.globalState.get(PREVIOUS_WRAPPER_KEY) === undefined) {
    await context.globalState.update(PREVIOUS_WRAPPER_KEY, current || null)
  }
  await configuration.update(CLAUDE_WRAPPER_SETTING, helper, vscode.ConfigurationTarget.Global)
  await vscode.commands.executeCommand('setContext', 'ccRouter.integrationConfigured', true)
  return true
}

async function restorePreviousWrapper(context: vscode.ExtensionContext): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('claudeCode')
  const current = configuration.get<string>(CLAUDE_WRAPPER_SETTING, '')
  if (!pathsEqual(current, resolveHelperPath(context))) {
    void vscode.window.showInformationMessage(
      text('Claude Code 当前没有使用 CC Router wrapper。', 'Claude Code is not using the CC Router wrapper.'),
    )
    return
  }
  const previous = context.globalState.get<string | null>(PREVIOUS_WRAPPER_KEY)
  await configuration.update(
    CLAUDE_WRAPPER_SETTING,
    previous || undefined,
    vscode.ConfigurationTarget.Global,
  )
  await context.globalState.update(PREVIOUS_WRAPPER_KEY, undefined)
  await vscode.commands.executeCommand('setContext', 'ccRouter.integrationConfigured', false)
  void vscode.window.showInformationMessage(
    text('已恢复原来的 Claude Code wrapper。', 'The previous Claude Code process wrapper was restored.'),
  )
}

async function probeConnection(
  context: vscode.ExtensionContext,
  tree: RouterTreeProvider,
  node: unknown,
): Promise<void> {
  if (!environmentSupported() || !helperReady(context)) return
  const workspace = currentWorkspace()
  if (!workspace) {
    void vscode.window.showWarningMessage(
      text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
    )
    return
  }

  try {
    const providerId = extractProviderId(node)
    const providers = await listProviders(context, workspace)
    const provider = providerId
      ? providers.find((candidate) => candidate.id === providerId)
      : providers.find((candidate) => candidate.selected)
    if (!provider || !provider.enabled) {
      void vscode.window.showInformationMessage(
        text('请先为当前工作区选择 Provider。', 'Select a Provider for this workspace first.'),
      )
      return
    }
    if (!provider.credentialConfigured) {
      const action = await vscode.window.showWarningMessage(
        text(
          `${provider.displayName} 尚未在 ${credentialStoreLabel()} 中配置 API Key。`,
          `${provider.displayName} has no API Key in ${credentialStoreLabel()}.`,
        ),
        text('打开 Provider 管理', 'Open Provider Manager'),
      )
      if (action) await vscode.commands.executeCommand('ccRouter.manageProviders')
      return
    }

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: text(
          `正在探测 ${provider.displayName} 的连接...`,
          `Probing ${provider.displayName}...`,
        ),
        cancellable: false,
      },
      () => probeProvider(context, provider.id),
    )
    tree.recordProbe(provider.id, result)

    const label = probeLabel(result)
    const status = result.httpStatus !== undefined ? ` (HTTP ${result.httpStatus})` : ''
    if (result.kind === 'ok') {
      void vscode.window.showInformationMessage(
        text(
          `${provider.displayName} 连接正常：${label}。`,
          `${provider.displayName} is reachable: ${label}.`,
        ),
      )
    } else {
      void vscode.window.showWarningMessage(
        text(
          `${provider.displayName} 探测结果：${label}${status}。`,
          `${provider.displayName} probe result: ${label}${status}.`,
        ),
      )
    }
  } catch (error) {
    await showHelperError(context, error)
  }
}

function extractProviderId(node: unknown): string | undefined {
  if (typeof node === 'string') return node
  if (node && typeof node === 'object' && (node as { type?: unknown }).type === 'provider') {
    return (node as { provider: ProviderSummary }).provider.id
  }
  return undefined
}

async function clearWorkspaceProvider(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<void> {  if (!environmentSupported() || !helperReady(context)) return
  const workspace = currentWorkspace()
  if (!workspace) return
  try {
    await clearProvider(context, workspace)
    await refresh()
    void vscode.window.showInformationMessage(
      text('已清除当前工作区路由。', 'The CC Router route was cleared for this workspace.'),
    )
  } catch (error) {
    await showHelperError(context, error)
  }
}

async function refreshStatus(
  context: vscode.ExtensionContext,
  status: vscode.StatusBarItem,
): Promise<void> {
  if (!environmentSupported(false)) {
    status.text = `$(warning) ${text('CC Router 不可用', 'CC Router unavailable')}`
    status.tooltip = text(
      '当前仅支持本地 Windows 或 Ubuntu 工作区。',
      'CC Router currently supports local Windows or Ubuntu workspaces.',
    )
    return
  }
  if (!helperExists(context)) {
    status.text = `$(warning) ${text('缺少 CC Router helper', 'CC Router helper missing')}`
    status.tooltip = resolveHelperPath(context)
    return
  }
  const workspace = currentWorkspace()
  if (!workspace) {
    status.text = '$(server-environment) CC Router'
    status.tooltip = text('打开工作区后选择 Provider。', 'Open a workspace to select a Provider.')
    return
  }
  try {
    const selected = (await listProviders(context, workspace)).find((provider) => provider.selected)
    status.text = selected
      ? `$(server-environment) ${selected.displayName}`
      : `$(server-environment) ${text('选择 Provider', 'Select Provider')}`
    status.tooltip = selected
      ? `${selected.mainModel}\n${selected.baseUrl}\n${text('仅新会话使用此路由。', 'Only new sessions use this route.')}`
      : text('为当前工作区选择 Claude Code Provider。', 'Select a Claude Code Provider for this workspace.')
  } catch (error) {
    status.text = `$(warning) ${text('CC Router 需要设置', 'CC Router needs setup')}`
    status.tooltip = localizedError(error)
  }

  const wrapper = vscode.workspace
    .getConfiguration('claudeCode')
    .get<string>(CLAUDE_WRAPPER_SETTING, '')
  await vscode.commands.executeCommand(
    'setContext',
    'ccRouter.integrationConfigured',
    pathsEqual(wrapper, resolveHelperPath(context)),
  )
}

function currentWorkspace(): string | undefined {
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const activeFolder = activeUri ? vscode.workspace.getWorkspaceFolder(activeUri) : undefined
  return activeFolder?.uri.fsPath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
}

function environmentSupported(showMessage = true): boolean {
  const supported = (process.platform === 'win32' || process.platform === 'linux') && !vscode.env.remoteName
  if (!supported && showMessage) {
    void vscode.window.showWarningMessage(
      text(
        'CC Router 当前仅支持本地 Windows 或 Ubuntu 工作区，暂不支持 WSL、SSH 和 Dev Containers。',
        'CC Router supports local Windows or Ubuntu workspaces. WSL, SSH and Dev Containers are not supported.',
      ),
    )
  }
  return supported
}

function helperReady(context: vscode.ExtensionContext): boolean {
  if (helperExists(context)) return true
  void vscode.window.showErrorMessage(
    text(
      `未找到 CC Router helper：${resolveHelperPath(context)}`,
      `CC Router helper was not found: ${resolveHelperPath(context)}`,
    ),
  )
  return false
}

async function showHelperError(context: vscode.ExtensionContext, error: unknown): Promise<void> {
  const manage = text('打开 Provider 管理', 'Open Provider Manager')
  const action = await vscode.window.showErrorMessage(localizedError(error), manage)
  if (action === manage) {
    await vscode.commands.executeCommand('ccRouter.manageProviders')
  }
}

async function refreshWithFeedback(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<void> {
  if (!environmentSupported() || !helperReady(context)) return
  const workspace = currentWorkspace()
  if (!workspace) {
    await refresh()
    void vscode.window.showWarningMessage(
      text('请先打开一个本地文件夹或工作区。', 'Open a local folder or workspace first.'),
    )
    return
  }

  try {
    const providers = await listProviders(context, workspace)
    await refresh()
    void vscode.window.showInformationMessage(
      text(
        `已读取 ${providers.length} 个 Provider 配置。`,
        `Loaded ${providers.length} Provider configurations.`,
      ),
    )
  } catch (error) {
    await refresh()
    await showHelperError(context, error)
  }
}

async function openDesktop(): Promise<void> {
  if (await focusRunningDesktop()) return

  const configuration = vscode.workspace.getConfiguration('ccRouter')
  const configured = configuration.get<string>('desktopPath', '').trim()
  let executable = await findDesktopExecutable(configured)
  if (!executable) {
    const locate = text('选择本机程序', 'Locate App')
    const openReleases = text('下载安装包', 'Open Releases')
    const choice = await vscode.window.showWarningMessage(
      text(
        '未自动找到 CC Router 桌面端。可以选择本机已有程序，或下载安装包。',
        'CC Router desktop was not found automatically. Locate an existing app or download the installer.',
      ),
      locate,
      openReleases,
    )
    if (choice === openReleases) {
      await vscode.env.openExternal(
        vscode.Uri.parse('https://github.com/NocoldBob/cc-router/releases'),
      )
      return
    }
    if (choice !== locate) return
    executable = await locateDesktopExecutable(configuration)
    if (!executable) return
  }

  launchDesktop(executable)
}

function launchDesktop(executable: string): void {
  const child = spawn(executable, [], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

async function locateDesktopExecutable(
  configuration: vscode.WorkspaceConfiguration,
): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    title: text('选择 CC Router 桌面程序', 'Locate CC Router Desktop'),
    openLabel: text('选择并打开', 'Select and Open'),
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: process.platform === 'win32'
      ? { [text('Windows 程序', 'Windows Executable')]: ['exe'] }
      : { AppImage: ['AppImage'] },
  })
  const executable = picked?.[0]?.fsPath
  if (executable) {
    await configuration.update('desktopPath', executable, vscode.ConfigurationTarget.Global)
  }
  return executable
}

function pathsEqual(left: string, right: string): boolean {
  if (process.platform === 'win32') {
    return left.trim().replaceAll('/', '\\').toLowerCase() === right.trim().replaceAll('/', '\\').toLowerCase()
  }
  return left.trim() === right.trim()
}

function localizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (sharedCatalogMissing(error)) {
    return text(
      '尚未生成共享 Provider 配置。可能打开了旧版桌面端，或桌面端与 VS Code 使用了不同的系统账户。请修复/更新桌面端后重新保存。',
      'Shared Provider configuration is missing. The desktop app may be outdated or running under a different OS account. Repair/update it, then save again.',
    )
  }
  return message.replace(/^CC Router:\s*/, '')
}

function sharedCatalogMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Shared Provider configuration is not initialized')
}
