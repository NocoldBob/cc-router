import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import * as vscode from 'vscode'
import {
  findDesktopExecutable,
  focusRunningDesktop,
  installDesktop,
  stopRunningDesktop,
} from './desktopApp'
import {
  clearProvider,
  helperExists,
  listProviders,
  probeProvider,
  resolveHelperPath,
  selectProvider,
  type ProviderSummary,
} from './helperClient'
import { text } from './localization'
import { probeLabel, RouterTreeProvider } from './routerTree'

const PREVIOUS_WRAPPER_KEY = 'ccRouter.previousClaudeProcessWrapper'
const ONBOARDING_VERSION_KEY = 'ccRouter.onboardingVersion'
const DESKTOP_INSTALL_OFFERED_KEY = 'ccRouter.desktopInstallOffered'
const CLAUDE_EXTENSION_ID = 'anthropic.claude-code'
const CLAUDE_WRAPPER_SETTING = 'claudeProcessWrapper'

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
    vscode.commands.registerCommand('ccRouter.openDesktop', () => openDesktop(context)),
    vscode.commands.registerCommand('ccRouter.repairDesktop', () =>
      repairDesktop(context, refresh)),
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

  void refresh()
  void showOnboarding(context)
}

export function deactivate(): void {}

async function showOnboarding(context: vscode.ExtensionContext): Promise<void> {
  const version = String(context.extension.packageJSON.version)
  if (context.globalState.get<string>(ONBOARDING_VERSION_KEY) !== version) {
    await context.globalState.update(ONBOARDING_VERSION_KEY, version)
    await vscode.commands.executeCommand('workbench.view.extension.ccRouter')
  }
  if (!context.globalState.get<boolean>(DESKTOP_INSTALL_OFFERED_KEY)) {
    await context.globalState.update(DESKTOP_INSTALL_OFFERED_KEY, true)
    const configured = vscode.workspace.getConfiguration('ccRouter').get<string>('desktopPath', '')
    if (!(await findDesktopExecutable(configured))) await openDesktop(context)
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
        `${provider.displayName} 尚未在 Windows Credential Manager 中配置 API Key。`,
        `${provider.displayName} has no API Key in Windows Credential Manager.`,
      ),
      text('打开 CC Router', 'Open CC Router'),
    )
    if (action) await openDesktop(context)
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
          `${provider.displayName} 尚未在 Windows Credential Manager 中配置 API Key。`,
          `${provider.displayName} has no API Key in Windows Credential Manager.`,
        ),
        text('打开 CC Router', 'Open CC Router'),
      )
      if (action) await openDesktop(context)
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
      '当前仅支持本地 Windows 工作区。',
      'CC Router currently supports local Windows workspaces only.',
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
  const supported = process.platform === 'win32' && !vscode.env.remoteName
  if (!supported && showMessage) {
    void vscode.window.showWarningMessage(
      text(
        'CC Router 当前仅支持本地 Windows 工作区，暂不支持 WSL、SSH 和 Dev Containers。',
        'CC Router currently supports local Windows workspaces. WSL, SSH and Dev Containers are not enabled in this beta.',
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
  const repair = text('修复/更新桌面端', 'Repair/Update Desktop')
  const open = text('打开 CC Router', 'Open CC Router')
  const action = await vscode.window.showErrorMessage(
    localizedError(error),
    ...(sharedCatalogMissing(error) ? [repair, open] : [open]),
  )
  if (action === repair) {
    await vscode.commands.executeCommand('ccRouter.repairDesktop')
  } else if (action === open) {
    await openDesktop(context)
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

async function repairDesktop(
  context: vscode.ExtensionContext,
  refresh: () => Promise<void>,
): Promise<void> {
  if (!environmentSupported()) return
  const installer = context.asAbsolutePath('desktop/cc-router-desktop-setup.exe')
  if (!existsSync(installer)) {
    void vscode.window.showErrorMessage(
      text(
        '当前扩展包未包含桌面安装器，请从 Marketplace 更新或重新安装 CC Router Companion。',
        'This extension package has no desktop installer. Update or reinstall CC Router Companion from the Marketplace.',
      ),
    )
    return
  }

  const confirm = text('修复并重新打开', 'Repair and Reopen')
  const choice = await vscode.window.showWarningMessage(
    text(
      '这会关闭正在运行的 CC Router，并用扩展内置的匹配版本覆盖安装。Provider 配置会保留，API Key 仍保存在 Windows Credential Manager。',
      'This closes the running CC Router and reinstalls the matching bundled version. Provider settings are preserved and API Keys remain in Windows Credential Manager.',
    ),
    { modal: true },
    confirm,
  )
  if (choice !== confirm) return

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: text('正在修复 CC Router 桌面端...', 'Repairing CC Router desktop...'),
        cancellable: false,
      },
      async () => {
        await stopRunningDesktop()
        await installDesktop(installer)
      },
    )
    const executable = await findDesktopExecutable('')
    if (!executable) {
      throw new Error(text('修复后未找到桌面程序。', 'Desktop app was not found after repair.'))
    }
    launchDesktop(executable)

    const synchronized = await waitForProviderCatalog(context, currentWorkspace())
    await refresh()
    if (synchronized) {
      void vscode.window.showInformationMessage(
        text(
          '桌面端已修复，共享 Provider 配置已恢复。',
          'Desktop repaired and the shared Provider configuration is available.',
        ),
      )
    } else {
      void vscode.window.showWarningMessage(
        text(
          '桌面端已修复并打开。请在桌面端点击一次“保存配置”，然后再刷新此视图。',
          'Desktop repaired and opened. Save once in the desktop app, then refresh this view.',
        ),
      )
    }
  } catch (error) {
    void vscode.window.showErrorMessage(
      text(
        `CC Router 桌面端修复失败：${localizedError(error)}`,
        `CC Router desktop repair failed: ${localizedError(error)}`,
      ),
    )
  }
}

async function waitForProviderCatalog(
  context: vscode.ExtensionContext,
  workspace: string | undefined,
): Promise<boolean> {
  if (!workspace) return false
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await listProviders(context, workspace)
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  return false
}

async function openDesktop(context: vscode.ExtensionContext): Promise<void> {
  if (await focusRunningDesktop()) return

  const configuration = vscode.workspace.getConfiguration('ccRouter')
  const configured = configuration.get<string>('desktopPath', '').trim()
  let executable = await findDesktopExecutable(configured)
  const installer = context.asAbsolutePath('desktop/cc-router-desktop-setup.exe')
  if (!executable && existsSync(installer)) {
    const install = text('立即安装', 'Install Now')
    const locate = text('选择已有程序', 'Locate Existing App')
    const choice = await vscode.window.showInformationMessage(
      text(
        'CC Router Companion 已包含桌面管理工具。是否现在为当前 Windows 用户安装？安装后可以直接管理 Provider 和 API Key。',
        'CC Router Companion includes the desktop manager. Install it for the current Windows user now to manage Providers and API Keys?',
      ),
      { modal: true },
      install,
      locate,
    )
    if (choice === install) {
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: text('正在安装 CC Router 桌面端...', 'Installing CC Router desktop...'),
            cancellable: false,
          },
          () => installDesktop(installer),
        )
        executable = await findDesktopExecutable('')
      } catch (error) {
        void vscode.window.showErrorMessage(
          text(
            `CC Router 桌面端安装失败：${localizedError(error)}`,
            `CC Router desktop installation failed: ${localizedError(error)}`,
          ),
        )
      }
    } else if (choice === locate) {
      executable = await locateDesktopExecutable(configuration)
    } else {
      return
    }
  }
  if (!executable) {
    const locate = text('选择本机程序', 'Locate App')
    const openReleases = text('下载安装包', 'Open Releases')
    const choice = await vscode.window.showWarningMessage(
      text(
        '未自动找到 CC Router 桌面端。可以选择本机已有的 cc-router.exe，或下载安装包。',
        'CC Router desktop was not found automatically. Locate an existing cc-router.exe or download the installer.',
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
    filters: { [text('Windows 程序', 'Windows Executable')]: ['exe'] },
  })
  const executable = picked?.[0]?.fsPath
  if (executable) {
    await configuration.update('desktopPath', executable, vscode.ConfigurationTarget.Global)
  }
  return executable
}

function pathsEqual(left: string, right: string): boolean {
  return left.trim().replaceAll('/', '\\').toLowerCase() === right.trim().replaceAll('/', '\\').toLowerCase()
}

function localizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (sharedCatalogMissing(error)) {
    return text(
      '尚未生成共享 Provider 配置。可能打开了旧版桌面端，或桌面端与 VS Code 使用了不同的 Windows 账户。请修复/更新桌面端后重新保存。',
      'Shared Provider configuration is missing. The desktop app may be outdated or running under a different Windows account. Repair/update it, then save again.',
    )
  }
  return message.replace(/^CC Router:\s*/, '')
}

function sharedCatalogMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Shared Provider configuration is not initialized')
}
