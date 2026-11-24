import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

const helper = vi.hoisted(() => ({
  exportCatalog: vi.fn(),
  syncCatalog: vi.fn(),
}))

vi.mock('./helperClient', () => helper)
vi.mock('vscode', () => ({
  EventEmitter: class {
    readonly event = () => ({ dispose: () => undefined })
    fire(): void {}
  },
}))

import { ProviderStore } from './providerStore'
import { defaultProviders } from './shared/defaultProviders'

const PROVIDERS_KEY = 'ccRouter.providers.v1'

function contextWith(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const context = {
    globalState: {
      get: (key: string) => values.get(key),
      update: async (key: string, value: unknown) => {
        if (value === undefined) values.delete(key)
        else values.set(key, value)
      },
    },
  }
  return { context: context as unknown as vscode.ExtensionContext, values }
}

const earliestReleaseProvider = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/anthropic',
  authEnvName: 'DEEPSEEK_API_KEY',
  mainModel: 'deepseek-v4-pro[1m]',
  fastModel: 'deepseek-v4-flash',
  opusModel: '',
  sonnetModel: '',
  haikuModel: '',
  fableModel: '',
  subagentModel: '',
  effortLevel: 'max',
  autoCompactWindow: '',
  maxContextTokens: '',
  notes: 'Catalog shape from the first desktop release.',
  enabled: true,
  accent: 'green',
}

beforeEach(() => {
  vi.clearAllMocks()
  helper.exportCatalog.mockRejectedValue(new Error('No legacy catalog'))
  helper.syncCatalog.mockResolvedValue(undefined)
})

describe('ProviderStore upgrades', () => {
  it('imports the earliest released catalog and defaults fields added later', async () => {
    helper.exportCatalog.mockResolvedValue(JSON.stringify([earliestReleaseProvider]))
    const { context, values } = contextWith()

    const store = await ProviderStore.load(context)

    expect(store.list()).toHaveLength(1)
    expect(store.get('deepseek')).toMatchObject({
      mainModel: 'deepseek-v4-pro[1m]',
      apiTimeoutMs: '',
      disableNonessentialTraffic: '',
      maxOutputTokens: '',
    })
    expect(values.get(PROVIDERS_KEY)).toEqual(store.list())
    expect(helper.syncCatalog).toHaveBeenCalledOnce()
  })

  it('drops legacy embedded credential fields before persisting or mirroring', async () => {
    const legacyValue = 'legacy-value-that-must-not-survive'
    helper.exportCatalog.mockResolvedValue(
      JSON.stringify([{ ...earliestReleaseProvider, authToken: legacyValue }]),
    )
    const { context, values } = contextWith()

    const store = await ProviderStore.load(context)
    const persisted = JSON.stringify(values.get(PROVIDERS_KEY))
    const mirrored = helper.syncCatalog.mock.calls[0][1] as string

    expect(store.list()[0]).not.toHaveProperty('authToken')
    expect(persisted).not.toContain('authToken')
    expect(persisted).not.toContain(legacyValue)
    expect(mirrored).not.toContain('authToken')
    expect(mirrored).not.toContain(legacyValue)
  })

  it('uses an existing extension catalog instead of importing the desktop again', async () => {
    helper.exportCatalog.mockResolvedValue(JSON.stringify([earliestReleaseProvider]))
    const stored = { ...earliestReleaseProvider, id: 'custom', displayName: 'My Provider' }
    const { context } = contextWith({ [PROVIDERS_KEY]: [stored] })

    const store = await ProviderStore.load(context)

    expect(store.list()).toEqual([expect.objectContaining({ id: 'custom' })])
    expect(helper.exportCatalog).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', '{not-json'],
    ['an empty legacy list', '[]'],
    ['an unreadable legacy catalog', null],
  ])('falls back to all built-in templates after %s', async (_label, legacy) => {
    if (legacy === null) helper.exportCatalog.mockRejectedValue(new Error('Unreadable'))
    else helper.exportCatalog.mockResolvedValue(legacy)
    const { context, values } = contextWith()

    const store = await ProviderStore.load(context)

    expect(store.list()).toEqual(defaultProviders)
    expect(values.get(PROVIDERS_KEY)).toEqual(defaultProviders)
  })
})
