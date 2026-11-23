import * as vscode from 'vscode'
import { defaultProviders } from './shared/defaultProviders'
import type { Provider, ProviderAccent } from './shared/types'
import { exportCatalog, syncCatalog } from './helperClient'

const PROVIDERS_KEY = 'ccRouter.providers.v1'

type StoredProvider = Partial<Provider> & { authToken?: string }

/** Mirrors the desktop sanitize logic; drops any legacy embedded token. */
export function normalizeProvider(provider: StoredProvider, index: number): Provider {
  const accent: ProviderAccent = ['green', 'blue', 'orange', 'violet'].includes(
    String(provider.accent),
  )
    ? (provider.accent as ProviderAccent)
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
    apiTimeoutMs: String(provider.apiTimeoutMs || ''),
    disableNonessentialTraffic: String(provider.disableNonessentialTraffic || ''),
    maxOutputTokens: String(provider.maxOutputTokens || ''),
    notes: String(provider.notes || ''),
    enabled: provider.enabled !== false,
    accent,
  }
}

/**
 * The extension-side source of truth for Providers. globalState holds the
 * secret-free catalog; every change is mirrored to the helper so the Claude
 * Code process wrapper can launch sessions without the extension running.
 */
export class ProviderStore {
  private providers: Provider[]
  private readonly emitter = new vscode.EventEmitter<void>()
  readonly onDidChange = this.emitter.event

  private constructor(
    private readonly context: vscode.ExtensionContext,
    providers: Provider[],
  ) {
    this.providers = providers
  }

  static async load(context: vscode.ExtensionContext): Promise<ProviderStore> {
    const stored = context.globalState.get<StoredProvider[]>(PROVIDERS_KEY)
    if (Array.isArray(stored) && stored.length) {
      const store = new ProviderStore(context, stored.map(normalizeProvider))
      await store.syncMirror()
      return store
    }

    // Migration path: adopt the catalog a desktop install may have written.
    try {
      const raw = await exportCatalog(context)
      const parsed = JSON.parse(raw) as StoredProvider[]
      if (Array.isArray(parsed) && parsed.length) {
        const store = new ProviderStore(context, parsed.map(normalizeProvider))
        await store.persist()
        return store
      }
    } catch {
      // No shared catalog yet; fall through to the built-in templates.
    }

    const store = new ProviderStore(
      context,
      defaultProviders.map((provider) => ({ ...provider })),
    )
    await store.persist()
    return store
  }

  list(): Provider[] {
    return this.providers.map((provider) => ({ ...provider }))
  }

  get(providerId: string): Provider | undefined {
    const found = this.providers.find((provider) => provider.id === providerId)
    return found ? { ...found } : undefined
  }

  async updateAll(providers: Provider[]): Promise<void> {
    this.providers = providers
    await this.persist()
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(PROVIDERS_KEY, this.providers)
    await this.syncMirror()
  }

  private async syncMirror(): Promise<void> {
    await syncCatalog(this.context, JSON.stringify(this.providers))
    this.emitter.fire()
  }
}
