import {
  AlertTriangle,
  Check,
  ChevronDown,
  CirclePlus,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Laptop,
  LockKeyhole,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Terminal,
  Trash2,
  Undo2,
  Upload,
  Waypoints,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  defaultProviders,
  providerMatchesDefaultTemplate,
  providerTemplateMetadata,
} from './defaultProviders'
import {
  applyUserRoute,
  clearUserRoute,
  deleteCredential,
  getCredentialStatus,
  getLaunchReadiness,
  getRuntimeInfo,
  getUserRouteStatus,
  launchClaude,
  nativeRuntimeAvailable,
  rollbackUserRoute,
  saveCredential,
  syncProviderCatalog,
  type RuntimeInfo,
  type LaunchReadiness,
  type UserRouteStatus,
} from './nativeRouter'
import { providerIsValid } from './providerValidation'
import { generateOutput, generateStatusCommands } from './routerCommands'
import type { OutputMode, Provider, ProviderAccent } from './types'

const STORAGE_KEY = 'cc-router.providers.v1'
const CLI_PATH_KEY = 'cc-router.cli-path.v1'
const WORKING_DIRECTORY_KEY = 'cc-router.working-directory.v1'
const LEGACY_SECRET_PREF_KEY = 'cc-router.persist-secrets.v1'

const cloneDefaults = () => defaultProviders.map((provider) => ({ ...provider }))

type StoredProvider = Partial<Provider> & { authToken?: string }

function normalizeProvider(provider: StoredProvider, index: number): Provider {
  const accent = ['green', 'blue', 'orange', 'violet'].includes(String(provider.accent))
    ? provider.accent as ProviderAccent
    : 'violet'

  return {
    id: String(provider.id || `imported-${index + 1}`),
    displayName: String(provider.displayName || `Imported Provider ${index + 1}`),
    baseUrl: String(provider.baseUrl || ''),
    authEnvName: String(provider.authEnvName || 'PROVIDER_API_KEY'),
    mainModel: String(provider.mainModel || ''),
    fastModel: String(provider.fastModel || ''),
    opusModel: String(provider.opusModel || ''),
    sonnetModel: String(provider.sonnetModel || ''),
    haikuModel: String(provider.haikuModel || ''),
    fableModel: String(provider.fableModel || ''),
    subagentModel: String(provider.subagentModel || ''),
    effortLevel: String(provider.effortLevel || ''),
    autoCompactWindow: String(provider.autoCompactWindow || ''),
    maxContextTokens: String(provider.maxContextTokens || ''),
    notes: String(provider.notes || ''),
    enabled: provider.enabled !== false,
    accent,
  }
}

function loadProviders(): Provider[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefaults()
    const parsed = JSON.parse(raw) as StoredProvider[]
    if (!Array.isArray(parsed) || !parsed.length) return cloneDefaults()
    const sanitized = parsed.map(({ authToken: _discardedToken, ...provider }, index) =>
      normalizeProvider(provider, index),
    )
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
    }
    window.localStorage.removeItem(LEGACY_SECRET_PREF_KEY)
    return sanitized
  } catch {
    return cloneDefaults()
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

const modeLabels: Record<OutputMode, string> = {
  session: '当前会话',
  persistent: '持久环境',
  settings: 'settings.json',
  clear: '清除路由',
}

const accentOptions: Array<{ value: ProviderAccent; label: string }> = [
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
  { value: 'orange', label: '橙色' },
  { value: 'violet', label: '紫色' },
]

type ConfirmAction = 'apply' | 'clear' | null

function App() {
  const initialProviders = useMemo(loadProviders, [])
  const [providers, setProviders] = useState<Provider[]>(initialProviders)
  const [selectedId, setSelectedId] = useState(initialProviders[0]?.id ?? '')
  const [mode, setMode] = useState<OutputMode>('session')
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialProviders))
  const [toast, setToast] = useState('')
  const [secretDraft, setSecretDraft] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [credentialConfigured, setCredentialConfigured] = useState(false)
  const [runtime, setRuntime] = useState<RuntimeInfo>({
    native: false,
    platform: 'web',
    cliAvailable: false,
    credentialStore: 'Unavailable in web preview',
  })
  const [routeStatus, setRouteStatus] = useState<UserRouteStatus | null>(null)
  const [launchReadiness, setLaunchReadiness] = useState<LaunchReadiness | null>(null)
  const [cliPath, setCliPath] = useState(() => window.localStorage.getItem(CLI_PATH_KEY) ?? '')
  const [workingDirectory, setWorkingDirectory] = useState(
    () => window.localStorage.getItem(WORKING_DIRECTORY_KEY) ?? '',
  )
  const [busy, setBusy] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const importRef = useRef<HTMLInputElement>(null)

  const selected = providers.find((provider) => provider.id === selectedId) ?? providers[0]
  const isDirty = JSON.stringify(providers) !== savedSnapshot
  const isValid = selected ? providerIsValid(selected, providers) : false
  const templateMetadata = selected ? providerTemplateMetadata[selected.id] : undefined
  const matchesVerifiedTemplate = selected
    ? providerMatchesDefaultTemplate(selected)
    : false
  const launchReady = Boolean(launchReadiness?.ready && !isDirty && isValid)
  const output = useMemo(
    () => (selected ? generateOutput(selected, mode) : ''),
    [selected, mode],
  )
  const canLaunch = Boolean(
    nativeRuntimeAvailable &&
      selected?.enabled &&
      launchReady,
  )

  const flash = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    if (!nativeRuntimeAvailable) return
    void syncProviderCatalog(initialProviders).catch((error) => flash(errorMessage(error)))
  }, [initialProviders])

  useEffect(() => {
    if (!nativeRuntimeAvailable) return
    void getRuntimeInfo(cliPath)
      .then(setRuntime)
      .catch((error) => flash(errorMessage(error)))
  }, [cliPath, refreshCounter])

  useEffect(() => {
    if (!nativeRuntimeAvailable || !selected) {
      setCredentialConfigured(false)
      setRouteStatus(null)
      return
    }
    setSecretDraft('')
    void Promise.all([
      getCredentialStatus(selected.id),
      getUserRouteStatus(selected),
    ])
      .then(([credential, status]) => {
        setCredentialConfigured(credential.configured)
        setRouteStatus(status)
      })
      .catch((error) => flash(errorMessage(error)))
  }, [selected, refreshCounter])

  useEffect(() => {
    if (!nativeRuntimeAvailable || !selected) {
      setLaunchReadiness(null)
      return
    }

    const timeout = window.setTimeout(() => {
      void getLaunchReadiness(selected, cliPath, workingDirectory)
        .then(setLaunchReadiness)
        .catch((error) => flash(errorMessage(error)))
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [selected, cliPath, workingDirectory, refreshCounter])

  const refreshNativeState = () => setRefreshCounter((value) => value + 1)

  const updateSelected = <K extends keyof Provider>(key: K, value: Provider[K]) => {
    if (!selected) return
    setProviders((current) =>
      current.map((provider) =>
        provider.id === selected.id ? { ...provider, [key]: value } : provider,
      ),
    )
  }

  const save = async () => {
    setBusy('save')
    try {
      if (nativeRuntimeAvailable) await syncProviderCatalog(providers)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providers))
      window.localStorage.setItem(CLI_PATH_KEY, cliPath)
      window.localStorage.setItem(WORKING_DIRECTORY_KEY, workingDirectory)
      setSavedSnapshot(JSON.stringify(providers))
      refreshNativeState()
      flash('配置已保存并同步，API Key 未写入配置文件')
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const copyOutput = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      flash('已复制到剪贴板')
    } catch {
      flash('浏览器未允许剪贴板访问')
    }
  }

  const copyStatusCheck = async () => {
    try {
      await navigator.clipboard.writeText(generateStatusCommands())
      flash('环境检查命令已复制')
    } catch {
      flash('浏览器未允许剪贴板访问')
    }
  }

  const storeCredential = async () => {
    if (!selected || !secretDraft.trim() || !nativeRuntimeAvailable) return
    setBusy('credential')
    try {
      await saveCredential(selected.id, secretDraft)
      setCredentialConfigured(true)
      setSecretDraft('')
      setShowSecret(false)
      refreshNativeState()
      flash('API Key 已保存到 Windows Credential Manager')
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const removeCredential = async () => {
    if (!selected || !nativeRuntimeAvailable) return
    setBusy('credential')
    try {
      await deleteCredential(selected.id)
      setCredentialConfigured(false)
      setSecretDraft('')
      refreshNativeState()
      flash('已从 Windows Credential Manager 删除 API Key')
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const startClaude = async () => {
    if (!selected || !canLaunch) return
    setBusy('launch')
    try {
      const result = await launchClaude(selected, cliPath, workingDirectory)
      flash(result.message)
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const confirmSystemAction = async () => {
    if (!confirmAction || !selected || !nativeRuntimeAvailable) return
    const action = confirmAction
    setConfirmAction(null)
    setBusy(action)
    try {
      const result = action === 'apply' ? await applyUserRoute(selected) : await clearUserRoute()
      flash(result.message)
      refreshNativeState()
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const rollback = async () => {
    if (!nativeRuntimeAvailable) return
    setBusy('rollback')
    try {
      const result = await rollbackUserRoute()
      flash(result.message)
      refreshNativeState()
    } catch (error) {
      flash(errorMessage(error))
    } finally {
      setBusy('')
    }
  }

  const addProvider = () => {
    const suffix = Date.now().toString(36)
    const provider: Provider = {
      id: `custom-${suffix}`,
      displayName: 'Custom Provider',
      baseUrl: 'https://',
      authEnvName: 'PROVIDER_API_KEY',
      mainModel: '',
      fastModel: '',
      opusModel: '',
      sonnetModel: '',
      haikuModel: '',
      fableModel: '',
      subagentModel: '',
      effortLevel: '',
      autoCompactWindow: '',
      maxContextTokens: '',
      notes: '',
      enabled: true,
      accent: 'violet',
    }
    setProviders((current) => [...current, provider])
    setSelectedId(provider.id)
  }

  const duplicateProvider = () => {
    if (!selected) return
    const suffix = Date.now().toString(36)
    const duplicate: Provider = {
      ...selected,
      id: `${selected.id}-copy-${suffix}`,
      displayName: `${selected.displayName} Copy`,
    }
    setProviders((current) => [...current, duplicate])
    setSelectedId(duplicate.id)
  }

  const deleteProvider = () => {
    if (!selected || providers.length === 1) return
    const next = providers.filter((provider) => provider.id !== selected.id)
    setProviders(next)
    setSelectedId(next[0].id)
  }

  const resetDefaults = () => {
    const next = cloneDefaults()
    setProviders(next)
    setSelectedId(next[0].id)
    setMode('session')
    flash('已恢复内置模板，保存后生效')
  }

  const exportProviders = () => {
    const blob = new Blob([JSON.stringify(providers, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'cc-router-providers.json'
    anchor.click()
    URL.revokeObjectURL(url)
    flash('Provider 配置已导出，不含 API Key')
  }

  const importProviders = async (file?: File) => {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as StoredProvider[]
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('Invalid file')
      const imported = parsed.map(normalizeProvider)
      setProviders(imported)
      setSelectedId(imported[0].id)
      flash(`已导入 ${imported.length} 个 Provider`)
    } catch {
      flash('导入失败：文件格式无效')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  if (!selected) {
    return (
      <main className="empty-state">
        <Waypoints aria-hidden="true" />
        <h1>没有 Provider</h1>
        <button className="button primary" onClick={addProvider}>
          <CirclePlus size={16} /> 新建 Provider
        </button>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Waypoints size={20} /></div>
          <div><strong>CC Router</strong><span>Local route manager</span></div>
        </div>

        <div className="sidebar-heading">
          <span>PROVIDERS</span>
          <button className="icon-button" title="新建 Provider" onClick={addProvider}><CirclePlus size={17} /></button>
        </div>

        <nav className="provider-list" aria-label="Provider 列表">
          {providers.map((provider) => (
            <button
              key={provider.id}
              className={`provider-item ${provider.id === selected.id ? 'active' : ''}`}
              onClick={() => setSelectedId(provider.id)}
            >
              <span className={`provider-glyph ${provider.accent}`}>{provider.displayName.trim().slice(0, 1).toUpperCase() || '?'}</span>
              <span className="provider-copy"><strong>{provider.displayName || 'Unnamed Provider'}</strong><small>{provider.mainModel || 'Model not set'}</small></span>
              <span className={`status-dot ${provider.enabled ? 'on' : ''}`} />
            </button>
          ))}
        </nav>

        <div className="sidebar-tools">
          <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importProviders(event.target.files?.[0])} />
          <button onClick={() => importRef.current?.click()}><Upload size={15} /> 导入配置</button>
          <button onClick={exportProviders}><Download size={15} /> 导出配置</button>
          <button onClick={resetDefaults}><RotateCcw size={15} /> 恢复模板</button>
        </div>

        <div className={`local-status ${nativeRuntimeAvailable ? 'native' : ''}`}>
          {nativeRuntimeAvailable ? <LockKeyhole size={17} /> : <Laptop size={17} />}
          <span>
            <strong>{nativeRuntimeAvailable ? 'Desktop runtime' : 'Web preview'}</strong>
            <small>{nativeRuntimeAvailable ? 'Credential Manager · 无代理' : '本地命令不可用'}</small>
          </span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="route-title">
            <span className={`provider-glyph ${selected.accent}`}>{selected.displayName.trim().slice(0, 1).toUpperCase() || '?'}</span>
            <div>
              <div className="title-line">
                <h1>{selected.displayName || 'Unnamed Provider'}</h1>
                <span className={`route-badge ${isValid ? 'ready' : 'invalid'}`}>
                  {isValid ? <Check size={12} /> : <AlertTriangle size={12} />}
                  {isValid ? 'Configured' : 'Needs attention'}
                </span>
                {routeStatus?.matchesSelected && <span className="route-badge active-route"><Power size={11} />系统默认</span>}
              </div>
              <p>{selected.baseUrl}</p>
              {templateMetadata && (
                <div className={`template-meta ${matchesVerifiedTemplate ? '' : 'modified'}`}>
                  <span>
                    {matchesVerifiedTemplate
                      ? `内置模板已验证 ${templateMetadata.verifiedAt}`
                      : `模板已修改，验证日期 ${templateMetadata.verifiedAt} 仅适用于默认值`}
                  </span>
                  <a href={templateMetadata.documentationUrl} target="_blank" rel="noreferrer">
                    官方文档 <ExternalLink size={11} />
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="top-actions">
            {isDirty && <span className="unsaved">未保存更改</span>}
            <button className="button subtle" onClick={duplicateProvider}><Copy size={15} /> 复制</button>
            <button className="button primary" disabled={Boolean(busy)} onClick={() => void save()}><Save size={15} /> 保存配置</button>
          </div>
        </header>

        {!nativeRuntimeAvailable && (
          <div className="runtime-banner">
            <Laptop size={17} />
            <span><strong>当前是 Web 预览</strong><small>一键启动、Credential Manager 和系统环境写入仅在 Tauri 桌面版中启用。</small></span>
          </div>
        )}

        <div className="content-grid">
          <section className="editor-panel" aria-label="Provider 配置">
            <div className="section-heading">
              <div><h2>连接配置</h2><p>Claude Code 使用的 endpoint 和鉴权来源</p></div>
              <label className="switch-row">
                <span>{selected.enabled ? '已启用' : '已停用'}</span>
                <input type="checkbox" checked={selected.enabled} onChange={(event) => updateSelected('enabled', event.target.checked)} />
                <span className="switch" aria-hidden="true" />
              </label>
            </div>

            <div className="form-grid two-column">
              <label className="field"><span>显示名称</span><input value={selected.displayName} onChange={(event) => updateSelected('displayName', event.target.value)} /></label>
              <label className="field">
                <span>Provider ID</span>
                <input
                  value={selected.id}
                  disabled={credentialConfigured}
                  title={credentialConfigured ? '删除已保存的 API Key 后才能修改 Provider ID' : undefined}
                  onChange={(event) => {
                    const value = event.target.value
                    setProviders((current) => current.map((provider) => provider.id === selected.id ? { ...provider, id: value } : provider))
                    setSelectedId(value)
                  }}
                />
              </label>
              <label className="field full"><span>Base URL</span><input value={selected.baseUrl} spellCheck={false} onChange={(event) => updateSelected('baseUrl', event.target.value)} /></label>
              <label className="field"><span>备用环境变量名</span><input value={selected.authEnvName} spellCheck={false} onChange={(event) => updateSelected('authEnvName', event.target.value.toUpperCase())} /></label>
              <label className="field">
                <span>标识色</span>
                <span className="select-wrap">
                  <span className={`color-swatch ${selected.accent}`} />
                  <select value={selected.accent} onChange={(event) => updateSelected('accent', event.target.value as ProviderAccent)}>
                    {accentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <ChevronDown size={15} />
                </span>
              </label>
            </div>

            <div className="section-rule" />
            <div className="section-heading compact"><div><h2>模型映射</h2><p>缺省角色会回退到主模型或快速模型</p></div></div>
            <div className="form-grid two-column">
              <label className="field"><span>主模型</span><input value={selected.mainModel} onChange={(event) => updateSelected('mainModel', event.target.value)} /></label>
              <label className="field"><span>快速模型</span><input value={selected.fastModel} onChange={(event) => updateSelected('fastModel', event.target.value)} /></label>
              <label className="field"><span>Opus</span><input placeholder="回退到主模型" value={selected.opusModel} onChange={(event) => updateSelected('opusModel', event.target.value)} /></label>
              <label className="field"><span>Sonnet</span><input placeholder="回退到主模型" value={selected.sonnetModel} onChange={(event) => updateSelected('sonnetModel', event.target.value)} /></label>
              <label className="field"><span>Haiku</span><input placeholder="回退到快速模型" value={selected.haikuModel} onChange={(event) => updateSelected('haikuModel', event.target.value)} /></label>
              <label className="field"><span>Fable</span><input placeholder="回退到主模型" value={selected.fableModel} onChange={(event) => updateSelected('fableModel', event.target.value)} /></label>
              <label className="field"><span>子代理模型</span><input placeholder="回退到快速模型" value={selected.subagentModel} onChange={(event) => updateSelected('subagentModel', event.target.value)} /></label>
              <label className="field"><span>备注</span><input value={selected.notes} onChange={(event) => updateSelected('notes', event.target.value)} /></label>
            </div>

            <div className="section-rule" />
            <div className="section-heading compact"><div><h2>Agent 参数</h2><p>切换 Provider 时同步清理，避免上下文与思考档位串用</p></div></div>
            <div className="form-grid two-column">
              <label className="field">
                <span>思考档位</span>
                <span className="select-wrap plain-select">
                  <select value={selected.effortLevel} onChange={(event) => updateSelected('effortLevel', event.target.value)}>
                    <option value="">不设置</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                    <option value="xhigh">xhigh</option>
                    <option value="max">max</option>
                  </select>
                  <ChevronDown size={15} />
                </span>
              </label>
              <label className="field"><span>自动压缩窗口</span><input inputMode="numeric" placeholder="例如 262144" value={selected.autoCompactWindow} onChange={(event) => updateSelected('autoCompactWindow', event.target.value)} /></label>
              <label className="field"><span>最大上下文 Token</span><input inputMode="numeric" placeholder="例如 1048576" value={selected.maxContextTokens} onChange={(event) => updateSelected('maxContextTokens', event.target.value)} /></label>
            </div>

            <div className="section-rule" />
            <div className="section-heading compact">
              <div><h2>安全凭据</h2><p>API Key 由 Windows Credential Manager 保管</p></div>
              <span className={`credential-badge ${credentialConfigured ? 'configured' : ''}`}>
                {credentialConfigured ? <Check size={12} /> : <KeyRound size={12} />}
                {credentialConfigured ? '已配置' : '未配置'}
              </span>
            </div>
            <div className="credential-row">
              <label className="field secret-field">
                <span>{credentialConfigured ? '替换 API Key' : '输入 API Key'}</span>
                <span className="input-with-action">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={secretDraft}
                    autoComplete="new-password"
                    placeholder={nativeRuntimeAvailable ? '仅用于写入凭据库' : '桌面版中启用'}
                    disabled={!nativeRuntimeAvailable}
                    onChange={(event) => setSecretDraft(event.target.value)}
                  />
                  <button type="button" title={showSecret ? '隐藏 API Key' : '显示 API Key'} onClick={() => setShowSecret((current) => !current)} disabled={!nativeRuntimeAvailable}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              <button className="button credential-save" disabled={!nativeRuntimeAvailable || !secretDraft.trim() || busy === 'credential'} onClick={() => void storeCredential()}>
                <LockKeyhole size={15} /> {credentialConfigured ? '替换凭据' : '保存凭据'}
              </button>
              <button className="icon-button credential-delete" title="删除已保存的 API Key" disabled={!credentialConfigured || busy === 'credential'} onClick={() => void removeCredential()}>
                <Trash2 size={16} />
              </button>
            </div>

            <div className="danger-zone">
              <button
                className="danger-button"
                title={credentialConfigured ? '请先删除此 Provider 的已保存凭据' : '删除此 Provider'}
                onClick={deleteProvider}
                disabled={providers.length === 1 || credentialConfigured}
              >
                <Trash2 size={15} /> 删除此 Provider
              </button>
            </div>
          </section>

          <aside className="output-panel" aria-label="路由控制与命令输出">
            <div className="output-header">
              <div><span className="eyebrow">ONE-CLICK ROUTING</span><h2>桌面路由控制</h2></div>
              <button className="refresh-button" title="刷新本机状态" onClick={refreshNativeState} disabled={!nativeRuntimeAvailable || Boolean(busy)}><RefreshCw size={14} /></button>
            </div>

            <div className="native-status-grid">
              <div><span>凭据</span><strong className={credentialConfigured ? 'ok' : 'warn'}>{credentialConfigured ? 'Credential Manager 已配置' : '需要 API Key'}</strong></div>
              <div><span>Claude CLI</span><strong className={runtime.cliAvailable ? 'ok' : 'warn'}>{runtime.cliAvailable ? '已检测到' : '未检测到'}</strong></div>
              <div><span>Windows 默认</span><strong className={routeStatus?.matchesSelected ? 'ok' : ''}>{routeStatus?.baseUrl ? (routeStatus.matchesSelected ? '当前 Provider' : '其他路由') : '未设置'}</strong></div>
              <div><span>默认路由鉴权</span><strong>{routeStatus?.authTokenSet ? '已设置' : '未设置'}</strong></div>
            </div>

            <div className="launch-config">
              <label className="dark-field">
                <span><FolderOpen size={13} /> 工作目录</span>
                <input value={workingDirectory} placeholder="例如 D:\\projects\\my-app" onChange={(event) => setWorkingDirectory(event.target.value)} />
              </label>
              <label className="dark-field">
                <span><Terminal size={13} /> Claude CLI 路径</span>
                <input value={cliPath} placeholder={runtime.cliPath || '自动检测，或填写 claude.exe / claude.cmd'} onChange={(event) => setCliPath(event.target.value)} />
              </label>
            </div>

            {nativeRuntimeAvailable && (
              <section className="readiness" aria-label="启动就绪检查">
                <div className="readiness-heading">
                  <span>启动检查</span>
                  <strong className={launchReady ? 'ready' : ''}>
                    {launchReady ? '可以启动' : '需要处理'}
                  </strong>
                </div>
                <div className="readiness-list">
                  <div className={launchReadiness?.cliAvailable ? 'pass' : 'fail'}>
                    {launchReadiness?.cliAvailable ? <Check size={13} /> : <AlertTriangle size={13} />}
                    <span>Claude CLI</span>
                    <small>{launchReadiness?.cliAvailable ? '已检测到' : '未检测到'}</small>
                  </div>
                  <div className={launchReadiness?.credentialConfigured ? 'pass' : 'fail'}>
                    {launchReadiness?.credentialConfigured ? <Check size={13} /> : <AlertTriangle size={13} />}
                    <span>API Key</span>
                    <small>{launchReadiness?.credentialConfigured ? '凭据库已配置' : '需要保存凭据'}</small>
                  </div>
                  <div className={launchReadiness?.workingDirectoryValid ? 'pass' : 'fail'}>
                    {launchReadiness?.workingDirectoryValid ? <Check size={13} /> : <AlertTriangle size={13} />}
                    <span>工作目录</span>
                    <small>{launchReadiness?.workingDirectoryValid ? '有效' : '目录不存在'}</small>
                  </div>
                  <div className={launchReadiness?.routeValid && isValid && !isDirty ? 'pass' : 'fail'}>
                    {launchReadiness?.routeValid && isValid && !isDirty ? <Check size={13} /> : <AlertTriangle size={13} />}
                    <span>路由配置</span>
                    <small>{isDirty ? '请先保存更改' : isValid ? '校验通过' : '配置无效'}</small>
                  </div>
                </div>
                <div className={`conflict-status ${launchReadiness?.conflictingVariables.length ? 'detected' : ''}`}>
                  <ShieldCheck size={14} />
                  <span>
                    {launchReadiness?.conflictingVariables.length
                      ? `启动时将清理或覆盖：${launchReadiness.conflictingVariables.join(', ')}`
                      : '未检测到需要隔离的 Claude 环境变量'}
                    <small>诊断仅返回变量名，不返回、记录或显示变量值。</small>
                  </span>
                </div>
              </section>
            )}

            <button className="button launch native-launch" disabled={!canLaunch || Boolean(busy)} onClick={() => void startClaude()}>
              <Play size={17} /> {busy === 'launch' ? '正在启动…' : `切换并启动 ${selected.displayName}`}
            </button>
            <div className="system-actions">
              <button className="button outline" disabled={!nativeRuntimeAvailable || !credentialConfigured || !isValid || isDirty || Boolean(busy)} onClick={() => setConfirmAction('apply')}>
                <Power size={15} /> 设为 Windows 默认
              </button>
              <button className="button outline" disabled={!nativeRuntimeAvailable || !routeStatus?.backupAvailable || Boolean(busy)} onClick={() => void rollback()}>
                <Undo2 size={15} /> 回滚
              </button>
              <button className="button clear-native" disabled={!nativeRuntimeAvailable || Boolean(busy)} onClick={() => setConfirmAction('clear')}>
                <X size={15} /> 清除
              </button>
            </div>

            {!runtime.cliAvailable && nativeRuntimeAvailable && (
              <div className="notice"><AlertTriangle size={16} /><span><strong>未找到 Claude Code CLI</strong><small>系统默认路由仍可用于重启后的 VS Code 插件；直接启动需要安装 CLI 或填写路径。</small></span></div>
            )}

            <div className="output-separator"><span>手动备用命令</span></div>
            <div className="output-header compact-output">
              <div><span className="eyebrow">ROUTE OUTPUT</span><h2>PowerShell</h2></div>
              <span className="key-state">读取 {selected.authEnvName}</span>
            </div>
            <div className="mode-tabs" role="tablist" aria-label="输出类型">
              {(Object.keys(modeLabels) as OutputMode[]).map((item) => (
                <button key={item} role="tab" aria-selected={mode === item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{modeLabels[item]}</button>
              ))}
            </div>
            <div className="code-wrap compact-code">
              <div className="code-toolbar"><span>{mode === 'settings' ? 'JSON' : 'POWERSHELL'}</span><button title="复制输出" onClick={() => void copyOutput()}><Clipboard size={15} /> 复制</button></div>
              <pre><code>{output}</code></pre>
            </div>
            <div className="verification">
              <div className="verification-title">
                <span><ShieldCheck size={16} /><strong>启动后验证</strong></span>
                <button onClick={() => void copyStatusCheck()}><Clipboard size={13} /> 复制环境检查</button>
              </div>
              <div className="verify-step"><span>1</span><code>/status</code></div>
              <div className="verify-step"><span>2</span><small>确认 Base URL 与模型</small></div>
            </div>
          </aside>
        </div>
      </main>

      {confirmAction && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setConfirmAction(null)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="dialog-icon"><AlertTriangle size={20} /></div>
            <div className="dialog-copy">
              <h2 id="confirm-title">{confirmAction === 'apply' ? `设为 Windows 默认：${selected.displayName}` : '清除 Windows 默认路由'}</h2>
              <p>{confirmAction === 'apply' ? '将同步 11 个 Windows 用户环境变量，并把 API Key 写入 ANTHROPIC_AUTH_TOKEN。' : '将清除 11 个 Claude Code 路由环境变量。'}</p>
              <div className="change-list">
                <span>当前</span><code>{routeStatus?.baseUrl || '未设置'}</code>
                <span>目标</span><code>{confirmAction === 'apply' ? selected.baseUrl : '清除全部路由变量'}</code>
              </div>
              <div className="dialog-notice"><RefreshCw size={14} />仅对新启动的终端和完全重启后的 VS Code 生效；操作前会保存可回滚备份。</div>
            </div>
            <div className="dialog-actions">
              <button className="button subtle" onClick={() => setConfirmAction(null)}>取消</button>
              <button className={`button ${confirmAction === 'clear' ? 'danger-confirm' : 'primary'}`} onClick={() => void confirmSystemAction()}>
                {confirmAction === 'apply' ? '确认设为默认' : '确认清除'}
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status"><Check size={16} /> {toast}<button title="关闭" onClick={() => setToast('')}><X size={14} /></button></div>
      )}
    </div>
  )
}

export default App
